

# Plano Consolidado — Fase 2 (Modo Plan, sub-fase por sub-fase)

Confirmação do diagnóstico: bate com o seu, com 1 ajuste — o **edge function `admin-manage-members` já existe** e a `MembersPage.tsx` já tem botões de adicionar/remover/mudar papel cabeados. O que falta de verdade na 2.A.2 é: detalhe de Time, drawer de Projeto compartilhado, aba "Membros e permissões" no projeto, vínculo time↔projeto e auditoria. Workspace WEDO tem 3 membros confirmados no banco.

**Ordem de execução fixada (sem pular):** 2.A.1 → 2.A.2 → 2.B → 2.C → 2.D → 2.E → 2.F → 2.G. Implementação só dispara depois da sua aprovação **por sub-fase**. Tudo pausado até você aprovar a 2.A.1.

---

## SUB-FASE 2.A.1 — Bug da página Membros (causa raiz + fix)

### Causa raiz

Não é RLS nem query: as duas páginas usam o mesmo `fetchMembers` do `workspaceStore`, e o WEDO tem 3 membros que retornam corretamente. O bug é **de inicialização do store + corrida de efeitos**:

1. `setCurrentWorkspace(id)` faz `set({ currentWorkspaceId: id, members: [] })` — **zera `members` imediatamente**.
2. `MembersPage` renderiza, lê `members` do store (vazio), mostra "Nenhum membro".
3. Em paralelo, `useEffect([currentWorkspaceId])` dispara `fetchMembers`. Mas se o usuário entra direto em `/team/members` numa rota que **não passou antes pela WorkloadPage** ou se houve troca de workspace, o estado fica vazio até a query voltar — e em sessões com latência ou re-render abortado pelo Zustand, o resultado pode nem chegar a popular a UI.
4. Pior: o `currentRole()` depende de `members` carregado. Antes de `fetchMembers` voltar, `isAdmin` calculado na `MembersPage` é `false` → some o botão "Adicionar membro". A Workload não depende de `isAdmin`, então parece "funcionar".
5. Não há estado `loadingMembers`, então a UI não distingue "carregando" de "vazio".

### Fix proposto (sem codar até aprovar)

a. No store: adicionar `loadingMembers: boolean` e `membersWorkspaceId: string | null` (qual workspace os members atuais representam).
b. `setCurrentWorkspace` deixa de zerar `members` — só marca `membersWorkspaceId = null` para invalidar.
c. `fetchMembers(id)` seta `loadingMembers: true` no início e `loadingMembers: false, membersWorkspaceId: id` no fim. Se o `id` mudou no meio (corrida), descarta o resultado.
d. `MembersPage` e `WorkloadPage`: enquanto `loadingMembers || membersWorkspaceId !== currentWorkspaceId`, mostrar skeleton. Só mostrar "Nenhum membro" quando carregamento terminou e veio vazio.
e. `isAdmin` da MembersPage passa a usar `currentRole()` do store (já existe) ao invés de procurar no `members` que pode estar vazio em transição. Como fallback enquanto carrega, permitir que o owner do workspace (já em `workspaces[].ownerId === user.id`) veja o botão.
f. Garantir que `fetchWorkspaces` é chamado **uma vez no boot** (em `AppLayout`/`AuthContext`), não em cada página. Isso elimina re-fetches que zeram o estado.
g. Validação RLS: rodar `SELECT * FROM workspace_members WHERE workspace_id = '<WEDO>'` autenticado como cada um dos 3 usuários. Se algum não vê os outros, ajustar a policy `wm_select` (hoje usa `is_workspace_member` — correto, mas confirmar que owner está como `member` da própria tabela, o que já vi no banco).

**Entregáveis 2.A.1:** patch em `workspaceStore.ts`, `MembersPage.tsx`, `WorkloadPage.tsx`, `TeamsPage.tsx`, `SharedProjectsPage.tsx`, `AppLayout.tsx`. Sem migração.

---

## SUB-FASE 2.A.2 — CRUD completo de gestão de equipe

### Schema novo

```sql
-- Auditoria
CREATE TABLE workspace_audit_log (
  id uuid PK, workspace_id uuid, actor_user_id uuid,
  entity_type text,         -- 'workspace_member'|'team'|'team_member'|'project_member'|'project_team_link'|'project_visibility'
  entity_id uuid,
  action text,              -- 'create'|'update'|'delete'|'role_change'|'link'|'unlink'
  before jsonb, after jsonb,
  created_at timestamptz default now()
);
-- RLS: só admin do workspace lê.

-- Vínculo Time ↔ Projeto (acesso herdado)
CREATE TABLE project_teams (
  project_id uuid, team_id uuid, default_role project_role default 'editor',
  added_at timestamptz default now(), added_by uuid,
  PRIMARY KEY (project_id, team_id)
);
-- RLS: select por has_project_access; cud por project_role='admin'.
```

Ajustar `has_project_access` para considerar `project_teams` (`team_members` do time vinculado herda acesso).

### Edge Function `admin-manage-members` (extensão)

Já existe para workspace. Adicionar actions:
- `team_create`, `team_update`, `team_delete`
- `team_member_add`, `team_member_remove`, `team_member_role`
- `project_member_add`, `project_member_remove`, `project_member_role`
- `project_team_link`, `project_team_unlink`
- `project_visibility_set`

Cada action grava em `workspace_audit_log`. Validações de autorização replicadas no servidor (não só RLS).

### UI

- **Página Membros**: já tem CRUD do workspace. Só ajustar fix da 2.A.1 e adicionar coluna "Times" (badges) e "Projetos" (contador clicável).
- **Página Times → detalhe `/team/teams/:id`**:
  - Header: nome + descrição editáveis (admin do workspace).
  - Aba "Membros do time": lista, dropdown role (`lead`|`member`), botão remover, autocomplete restrito a workspace_members para adicionar.
  - Aba "Projetos vinculados": lista de `project_teams`, botão "Vincular projeto" (multi-select), unlink.
  - Drag-and-drop opcional: pulamos nesta sub-fase, fica como nice-to-have.
- **Página Projetos compartilhados**: card com 2 contadores reais (membros diretos / via times). Clique em qualquer contador abre **drawer lateral**:
  - Aba "Membros diretos": lista + dropdown role + autocomplete add + remove.
  - Aba "Times com acesso": lista de `project_teams` + botão "Vincular time inteiro" + unlink.
  - Aba "Visibilidade": radio `private`|`team`|`workspace`.
- **Painel do projeto (sidebar quando projeto aberto)**: aba "Membros e permissões" reaproveita o mesmo componente do drawer.

### Fluxo

```text
Admin do workspace
  └─ cria/edita time
      └─ adiciona pessoas do workspace ao time
          └─ vincula time a projetos
              └─ todos do time herdam acesso default 'editor'
                  └─ admin do projeto pode promover/rebaixar individuais
                      └─ tudo grava em workspace_audit_log
```

### RLS resumida

| Tabela | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| workspace_audit_log | admin do workspace | service role only |
| project_teams | has_project_access | project_role = admin |

**Entregáveis 2.A.2:** 1 migração (schema + função `has_project_access` v2), extensão da edge `admin-manage-members`, 4 telas/painéis novos, hooks `useTeamDetail`/`useProjectMembers`.

---

## SUB-FASE 2.B — Chat (retomar com os trincos)

Schema já está aplicado. Falta UI + 2 ajustes.

### Ajustes obrigatórios sobre o que já foi planejado

1. **Trigger de bundling no `task_activity_log` para `message_sent`** (hoje insere uma linha por mensagem):

```text
Se a última linha do task_activity_log do mesmo task_id é
  action='message_sent' E user_id=novo E created_at > now()-10min:
    UPDATE essa linha → payload.count += 1, payload.last_snippet = ...
Senão:
    INSERT nova linha "iniciou conversa", payload.count=1
```

2. **Auto-participantes na conversa-tarefa**: criador + responsável + aprovadores + informados. Hoje só criador entra. Adicionar trigger que escuta INSERT em `task_assignees` e adiciona em `conversation_participants` (já existe `handle_task_assignee_to_conversation`, mas precisa filtrar por role quando a 2.C estiver pronta — por ora adiciona todos).

### UI a entregar

- `ChatLauncher` (já existe): painel deslizante esquerdo, lista conversas, badge não-lidos. Botão "Abrir em página dedicada" → `/conversations/:id`.
- `ChatThread` (já existe): bubbles, avatar, timestamp, anexos (img/pdf/doc via `chat-attachments`), edição inline com marca "editado" (campo `edited_at`), **sem delete**.
- **Autocomplete `@`**: popover com `members` do workspace filtrado por digitação. Salva em `messages.mentions` (jsonb array de user_ids).
- **Notificação chamativa**: ao detectar mention do user logado → `MentionNotifier` (já existe) dispara: toast `variant="destructive"` persistente até clicar + badge piscando no sino (animação CSS) + som opcional (toggle em settings) + insert em `notifications` com `category='mention'`.
- **Aba "Conversa" em `TaskDetailPanel`**, ordem: Comentários → **Conversa** → Atividade. Botão `TaskConversationButton` (já existe) garante que a conversa exista (chama trigger de auto-criação se for workspace compartilhado).
- **Realtime**: subscrever `messages` e `conversation_participants` por workspace.

**Entregáveis 2.B:** 1 migração (trigger de bundling + ajuste de participantes), conclusão de `ChatLauncher`, `ChatThread`, `MentionNotifier`, integração na `TaskDetailPanel`, página `/conversations/:id`.

---

## SUB-FASE 2.C — Papéis na tarefa (RACI)

### Schema

```sql
ALTER TABLE task_assignees ADD COLUMN role text NOT NULL DEFAULT 'responsible';
-- CHECK via trigger (não constraint): role IN ('responsible','approver','informed')
ALTER TABLE task_assignees DROP CONSTRAINT task_assignees_pkey;
ALTER TABLE task_assignees ADD PRIMARY KEY (task_id, user_id, role);
```

### UI

`TaskDetailPanel` ganha 3 campos separados (Responsável, Aprovador, Informado) com autocomplete restrito a membros do projeto. Badges coloridos distintos:
- Responsável: laranja (cor primária)
- Aprovador: roxo
- Informado: cinza

Lista de tarefas (`TaskItem`) mostra mini-avatares com borda colorida por role.

### Migração de dados

Linhas existentes em `task_assignees` viram `role='responsible'` (default já cobre).

**Entregáveis 2.C:** 1 migração, ajustes em `TaskDetailPanel`, `TaskItem`, `useTasks`.

---

## SUB-FASE 2.D — Watchers + Comentários oficiais

### Schema

```sql
CREATE TABLE task_watchers (
  task_id uuid, user_id uuid,
  source text,  -- 'assignee'|'approver'|'informed'|'author'|'manual'|'messaged'
  muted boolean default false,
  added_at timestamptz default now(),
  PRIMARY KEY (task_id, user_id)
);
-- RLS: select/cud se has_task_access.

ALTER TABLE task_comments
  ADD COLUMN promoted_from_message_id uuid,
  ADD COLUMN edited_at timestamptz;
-- Sem delete: dropar policy tc_delete.
```

Triggers que populam `task_watchers` automaticamente quando: tarefa criada (autor), `task_assignees` insert (com source = role), mensagem enviada por alguém novo na conversa-tarefa (source='messaged'). `ON CONFLICT (task_id,user_id) DO NOTHING`.

### UI

- Seção "Observadores" no `TaskDetailPanel` listando watchers + botão mute/unmute individual + botão "adicionar manualmente".
- Botão "Promover a comentário oficial" no menu (⋯) de cada mensagem do chat-tarefa → cria `task_comments` com `promoted_from_message_id` e marca a mensagem original como imutável (campo `locked_at` em messages — adicionar nesta migração).
- Comentários: edição inline com marca "editado", remover botão de delete.

**Entregáveis 2.D:** 1 migração, hook `useTaskWatchers`, ajustes em `TaskDetailPanel` e `ChatThread`.

---

## SUB-FASE 2.E — Workflow de Aprovação

### Schema

```sql
CREATE TABLE task_approvals (
  id uuid PK, task_id uuid, name text,
  type text CHECK (type IN ('any','all','sequential')),
  status text default 'pending',
  created_by uuid, created_at timestamptz, decided_at timestamptz
);

CREATE TABLE task_approval_steps (
  id uuid PK, approval_id uuid, approver_user_id uuid,
  order_index int, status text default 'pending',
  decided_at timestamptz, comment text, signature_hash text
);

ALTER TABLE projects ADD COLUMN require_approval_on_complete boolean default false;
```

### Lógica

Trigger ao decidir step:
- `any`: 1 aprovação → approval `approved`. 1 rejeição → `rejected`.
- `all`: todos `approved` → approval `approved`. Qualquer rejeição → `rejected`.
- `sequential`: ao aprovar step `n`, libera step `n+1` (notifica). Rejeição em qualquer step → `rejected`.

Tudo grava em `task_activity_log`. Bloqueio de `tasks.completed=true` se `projects.require_approval_on_complete=true` e não houver approval `approved` aberta.

### UI

Seção "Aprovação" no `TaskDetailPanel`:
- Botão "Solicitar aprovação" (responsável ou criador).
- Modal: nome, tipo (radio), seleção de aprovadores (autocomplete projeto).
- Barra de status: avatares por step com ícones ✓/✗/⏳, em sequência ou paralelo conforme tipo.
- Aprovador vê botões "Aprovar" (comentário opcional) / "Rejeitar" (comentário obrigatório).
- Configuração no painel do projeto: toggle "Exigir aprovação ao concluir".

**Entregáveis 2.E:** 1 migração com triggers, edge function `task-approval-decide` para validar e gravar, componentes `ApprovalSection`, `ApprovalRequestDialog`.

---

## SUB-FASE 2.F — Sync GCal multi-tenant

### Schema

```sql
CREATE TABLE task_calendar_events (
  task_id uuid, user_id uuid,
  gcal_event_id text, gcal_calendar_id text default 'primary',
  last_synced_at timestamptz,
  PRIMARY KEY (task_id, user_id)
);
-- RLS: user_id = auth.uid()
```

Migrar `tasks.google_calendar_event_id` para `task_calendar_events` (one-shot script no edge `migrate-gcal-events`) com **backup** em `tasks_gcal_backup`. Depois limpar a coluna.

### Lógica do sync (`google-calendar` edge)

```text
Para cada user logado:
  responsibles = SELECT task_id FROM task_assignees
                 WHERE user_id = me AND role = 'responsible'
  Para cada task em responsibles:
    upsert evento no GCal do user
    upsert linha em task_calendar_events
  Para cada task em task_calendar_events (user=me) que NÃO está mais em responsibles:
    DELETE evento no GCal + DELETE linha
```

### Limpeza one-shot

Edge `cleanup-orphan-gcal-events`:
1. Backup tabela `task_calendar_events` atual.
2. Para cada linha onde a tarefa não tem mais `task_assignees(user_id=user, role=responsible)`: deletar evento do GCal + linha.
3. Tarefas em workspace compartilhado sem responsável: skip (não cria pra ninguém).
4. **Rollback**: tabela `task_gcal_rollback_<timestamp>` com snapshot pré-execução; script reverso disponível como segundo edge function.

**Entregáveis 2.F:** 1 migração, refactor do `google-calendar`, 2 edges utilitárias, doc de rollback em `docs/rollback-gcal.md`.

---

## SUB-FASE 2.G — Notificações unificadas

### Schema

```sql
ALTER TABLE notifications
  ADD COLUMN category text,        -- 'mention'|'assignment'|'approval'|'comment'|'message'|'reminder'|'system'
  ADD COLUMN bundle_key text,
  ADD COLUMN actor_user_id uuid,
  ADD COLUMN target_url text,
  ADD COLUMN preview_text text,
  ADD COLUMN bundle_count int default 1,
  ADD COLUMN last_event_at timestamptz default now();

CREATE INDEX ON notifications (user_id, bundle_key, last_event_at DESC);

CREATE TABLE notification_preferences (
  user_id uuid PK,
  channels jsonb default '{"in_app":true,"push":false,"email":false}',
  per_category jsonb default '{}',  -- override por categoria
  dnd_start time, dnd_end time, dnd_timezone text
);
```

### Lógica de bundling

Função `notify(user_id, category, bundle_key, ...)`:
1. Procura notif existente do mesmo `user_id+bundle_key` com `last_event_at > now()-10min`.
2. Se acha: `UPDATE bundle_count+=1, last_event_at=now(), preview_text=novo`.
3. Senão: INSERT nova.

### Entrega

- In-app: sempre via realtime no sino.
- Push browser: Service Worker + VAPID, opt-in nas settings.
- Email: edge `send-notification-email` chamada por trigger se user `last_seen_at < now()-10min`. Resend secret ainda não está cadastrada → vou pedir só quando chegarmos nessa sub-fase.

**Entregáveis 2.G:** 1 migração, página "Configurações → Notificações", edge de email, integração SW/push.

---

## Regras transversais (toda sub-fase)

- RLS desde a criação em qualquer tabela nova.
- Audit log (`task_activity_log` ou `workspace_audit_log`) recebe entrada em toda ação relevante.
- Realtime onde fizer sentido (chat, notificações, aprovações).
- Mobile-first, tema escuro mantido.
- Não publicar nem alterar prod sem confirmação explícita.
- Refatorar quando necessário, sem colar por cima.

---

## Próximo passo

Aprove **só a 2.A.1** (bug fix Membros + ajuste do store) para eu disparar a implementação. As demais sub-fases ficam aguardando aprovação individual conforme avançamos. Se quiser ajustar qualquer coisa do desenho de uma sub-fase específica antes, me diz qual.

