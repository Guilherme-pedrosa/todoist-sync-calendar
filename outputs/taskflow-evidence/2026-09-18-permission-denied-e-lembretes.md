# TaskFlow — permission denied (anon) e lembretes bloqueados — 18/09/2026

Dois problemas reportados; correção aplicada direto no Postgres do taskflowedo
(`e2ba32a2`) via query_database + 1 ajuste de front. Sem mensagem ao agente
do Lovable.

## 1. Telas de workspace/projeto quebrando com "permission denied"

**Sintoma**: visitante deslogado ou com sessão recém-expirada via telas
quebradas com erro de banco em vez do prompt de login.

**Causa raiz**: as funções `is_workspace_member(uuid,uuid)`,
`is_workspace_admin(uuid,uuid)` e `project_role(uuid,uuid)` não tinham
GRANT EXECUTE para o role `anon` — mas 32 policies em ~20 tabelas
(workspaces, workspace_members, teams, team_members, projects, ...) as
chamam. Um SELECT como `anon` avaliava a policy, esbarrava na função e
estourava `42501 permission denied for function` ANTES de a RLS negar com
resultado vazio. `authenticated` sempre teve EXECUTE — por isso só
deslogados/expirados viam o erro. As irmãs `has_project_access`,
`has_task_access` e `is_conversation_participant` já tinham EXECUTE para
`anon`, confirmando que a lacuna era acidental (migration recente recriou
as três com REVOKE implícito).

**Prova (before)**:
```
BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM workspaces; ROLLBACK;
→ ERROR: 42501: permission denied for function is_workspace_member
```
Privilégios before: is_workspace_member anon=false · is_workspace_admin
anon=false · project_role anon=false (authenticated=true nas três).

**Fix**: `GRANT EXECUTE ... TO anon` nas três funções. Com `auth.uid()`
NULL todas retornam false → anon passa a receber **vazio** (RLS nega),
e o guard de rota do front (App.tsx:57, `Navigate to /auth`) mostra o
login limpo. Nenhum dado novo exposto.

**After (ensaio revertido)**: anon_workspaces=0, anon_teams=0,
anon_workspace_members=0, anon_projects=0 — sem erro.

## 2. Lembrete em tarefa de outra pessoa rejeitado em silêncio

**Sintoma**: responsável/informado adicionava lembrete em tarefa
compartilhada; o banco rejeitava e a pessoa nunca era notificada.

**Causa raiz**: as 4 policies de `reminders`
(view/insert/update/delete_own_reminders) exigiam `t.user_id = auth.uid()`
— só o dono ORIGINAL da tarefa. `reminders` não tem `user_id` próprio: o
lembrete pertence à tarefa, então quem tem acesso à tarefa deve poder
geri-lo.

**Fix**: policies recriadas (reminders_select/insert/update/delete, TO
authenticated) com: dono (`t.user_id`) OR criador (`t.created_by`) OR
`has_task_access(t.id, auth.uid())` (cobre responsáveis, informados,
membros do projeto e convidados de reunião). Guarda no script: abortava se
as 4 policies antigas não estivessem exatamente como no snapshot.

**After (ensaio revertido, tarefa #1105 do Filipe)**:
- Guilherme (informado): INSERT **PASSOU** ✔
- Usuário sem acesso (uid inexistente): INSERT **NEGADO 42501** ✔ (RLS
  continua fechada)

**Front**: RemindersDialog `persist()` agora checa erro do DELETE antes de
reinserir (antes: "Lembretes atualizados" mesmo com delete negado). Os
inserts de QuickAddDialog/taskStore são em tarefas recém-criadas pelo
próprio usuário — nunca foram afetados; não mexidos.

## Validação local

Typecheck (`tsc -p tsconfig.app.json`) limpo · vitest 54/54 · `npm run
build` OK.

## Ressalvas honestas

- As 3 funções ficam chamáveis via RPC do PostgREST por anônimos
  (boolean de membership dado par de UUIDs) — mesma classe das irmãs que
  já eram públicas; UUIDs não-enumeráveis, risco desprezível.
- Lembrete é da tarefa (schema sem user_id): qualquer pessoa com acesso à
  tarefa pode editar/apagar lembretes dela. Lembrete por pessoa exigiria
  coluna user_id — fora de escopo.
- Sessão que expira com o app aberto ainda mostra telas vazias por um
  instante até o guard redirecionar para /auth — sem erro agora.
- `trigger_at` placeholder para lembretes relativos no dialog (comentário
  "backend should compute") é preexistente; não tocado.
- Edge `process-reminders` roda como service_role — não afetada pelas
  policies. Nenhuma edge function alterada; nada a deployar fora do push.
