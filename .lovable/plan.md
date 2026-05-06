## COMMIT 3 — Deduplicação real do import Todoist via `todoist_id`

### Escopo confirmado
- Cobre **somente `import-inbox`** (L402-552 de `supabase/functions/todoist-proxy/index.ts`).
- **Sem backfill.** Tarefas legadas continuam sem `todoist_id` e seguem o caminho fallback existente (`buildTaskDedupKey`). Apenas tarefas importadas a partir desta release ficam blindadas contra ressurreição.
- `import-all` **não é alterado** nesta rodada (ressurreição por essa rota fica como dívida técnica conhecida).

### Mudanças

**1. Migration**
```sql
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS todoist_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_todoist_id_per_user
  ON public.tasks (user_id, todoist_id)
  WHERE todoist_id IS NOT NULL AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
```

Notas:
- Único parcial por `(user_id, todoist_id)` — escopo correto, já que `import-inbox` é per-user.
- Cláusula `WHERE deleted_at IS NULL` permite que uma reabertura legítima (com novo `external_ref` no fluxo external-create-task ou via "ressurreição manual" futura) não colida com a linha soft-deleted antiga.

**2. `supabase/functions/todoist-proxy/index.ts` — action `import-inbox`**

Mudanças localizadas, sem mexer em `import-all` nem nas funções utilitárias compartilhadas:

- **L455-456 — pré-fetch:** adicionar `todoist_id, deleted_at` ao select de `existingTasks`. Ainda filtrar por `inboxProjectId`, mas **incluir soft-deleted** (remover qualquer `.is('deleted_at', null)` implícito; a query já não filtra hoje, então só garantir que continua trazendo tudo).

- **Novo passo entre L468 e L470:** construir um segundo índice em memória:
  ```ts
  const existingByTodoistId = new Map<string, { id: string; deleted_at: string | null }>();
  for (const t of existingTasks || []) {
    if (t.todoist_id) existingByTodoistId.set(t.todoist_id, { id: t.id, deleted_at: t.deleted_at });
  }
  ```

- **Loop principal L471-520 — nova ordem de checagem por tarefa:**
  1. **Match por `todoist_id`** (autoritativo):
     - Se existe e `deleted_at != null`: incrementa `skippedDeleted`, `console.warn` no padrão do COMMIT 2:
       ```ts
       console.warn('[todoist-proxy] rejected: task soft-deleted', {
         todoist_id: tt.id,
         title: tt.content,
         user_id: user.id,
         scope: 'import-inbox',
       });
       ```
       `continue`.
     - Se existe e ativa: aplica `mergeImportedTask` patch (mesmo comportamento atual), `continue`.
  2. **Fallback dedup heurístico** (legado, já existente): mantém `buildTaskDedupKey` exatamente como está. Se bate, faz patch e — adicionalmente — preenche `todoist_id` nessa linha legada com `tt.id` no mesmo `update` (adoção do legado). Limita a um único bate, então as próximas reimportações usam o caminho rápido por id.
  3. **Caso novo:** entra em `tasksToInsert` com `row.todoist_id = tt.id` adicionado ao payload.

- **L502-519 — payload novo:** acrescentar `todoist_id: tt.id` ao objeto `row`.

- **Retorno L542-547:** estender com novos contadores:
  ```ts
  return json({
    success: true,
    totalFromTodoist: tdTasks.length,
    createdTasks,
    createdTaskLabels,
    skippedDeleted,
    skippedExisting,
    adoptedLegacy,
  });
  ```

- **Sem alteração** em `insertTasksWithHierarchy`, `buildTaskDedupKey`, `import-all`, passthrough legacy.

### Validação

Após aplicar:
```
rg -n "todoist_id" supabase/functions/todoist-proxy/index.ts
```
Esperado: ≥ 4 ocorrências (select pré-fetch, index map, write no payload novo, write na adoção do legado).

```
rg -n "todoist_id" supabase/functions/todoist-proxy/index.ts | rg -v "import-inbox|^[^:]+:[0-9]+:"
```
Confirmar visualmente que **nenhuma** ocorrência cai dentro do bloco `import-all` (L555-770).

### Teste manual (executado pelo operador, sem republish automático)
1. Configurar token Todoist, importar Inbox → tarefas vêm com `todoist_id` setado (verificar via SQL: `SELECT title, todoist_id FROM public.tasks WHERE todoist_id IS NOT NULL LIMIT 5`).
2. Apagar 1 tarefa importada no app.
3. Importar Inbox de novo → tarefa **não volta**. Resposta inclui `skippedDeleted: 1`.
4. Confirmar no log: `[todoist-proxy] rejected: task soft-deleted` com `todoist_id` correto.
5. Tarefa legada (importada antes do commit, sem `todoist_id`) numa segunda reimportação: bate por heurística, recebe `todoist_id` setado retroativamente. Próxima reimportação já usa caminho rápido.

### Restrições mantidas
- Não alterar policies RLS de `tasks`.
- Não alterar `can_insert_task`, `has_project_access`, `has_task_access`.
- Não alterar triggers (`auto_add_task_owner_as_assignee`, `ensure_task_workspace_defaults`, `enforce_task_user_id`, `assign_task_number`, etc.).
- Não dropar nem renomear colunas existentes.
- Não tocar em `google_tokens`, `google_calendar_event_id`, `external_ref`, `external_source`, `last_sync_source`.
- Não tocar em `import-all` nem no passthrough legacy.

### Critérios de aceitação revisitados
- **C1** ✅ (já garantido pelos COMMITs 1+2)
- **C2** ✅ (COMMIT 2)
- **C3** ✅ por este commit, **somente para tarefas importadas após o deploy**. Tarefas legadas Todoist (não há nenhuma hoje, P3.2 = 0) ficariam vulneráveis até a primeira reimportação adotá-las.
- **C4, C5** ✅ (COMMIT 1)

### Dívida técnica conhecida (declarada explicitamente)
- `import-all` continua sem proteção por `todoist_id`. Ressurreição por essa rota é possível. Documentar e tratar em rodada futura se virar problema operacional.
