# Fix: remover `auth.role()` da policy `tasks_insert`

## Diagnóstico
A policy `tasks_insert` no banco contém `auth.role() = 'authenticated'` que não existe no repo (migration aplicada manualmente no SQL Editor). Essa cláusula bloqueia todos os INSERTs do navegador. Q3 do diagnóstico anterior provou que o INSERT funciona quando o JWT claim é setado manualmente — confirmando que `auth.role()` em PostgREST retorna valores inconsistentes.

A cláusula é redundante: `TO authenticated` no header já garante a proteção de role.

## Mudança única

Criar uma migration **`fix_tasks_insert_remove_role_check`** com:

```sql
DROP POLICY IF EXISTS tasks_insert ON public.tasks;

CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND (created_by IS NULL OR created_by = auth.uid())
    AND project_id IS NOT NULL
    AND workspace_id IS NOT NULL
    AND public.can_insert_task(project_id, workspace_id, auth.uid())
  );

NOTIFY pgrst, 'reload schema';
```

## Validação pós-migration

1. Rodar:
   ```sql
   SELECT with_check::text
   FROM pg_policies
   WHERE schemaname='public' AND tablename='tasks' AND policyname='tasks_insert';
   ```
   Confirmar que o resultado **NÃO contém** `auth.role()`.

2. Pedir ao Guilherme para criar uma tarefa via drag no calendário e capturar o status do POST `/rest/v1/tasks` no Network tab. Esperado: **201 Created**. Se 403, capturar o response body literal.

## Restrições estritas
- ZERO outra alteração além desta migration
- NÃO mexer em `can_insert_task`, `has_project_access`, triggers, código TS/TSX, ou outras policies
- Se a migration falhar, devolver erro literal e parar

Após aplicar e validar com sucesso, responder: **"Fix tasks_insert aplicado e validado."**
