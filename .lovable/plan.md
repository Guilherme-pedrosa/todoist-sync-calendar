## Objetivo
Quando uma tarefa é concluída por uma pessoa **diferente** do criador, enviar uma notificação ao criador (a pessoa que abriu/delegou) avisando que a tarefa foi feita.

## Mudanças

### 1. Banco — novo trigger de conclusão (migration)
Criar função `handle_task_completion_notification()` e trigger `AFTER UPDATE` em `public.tasks` que dispara quando `completed` muda de `false` → `true`.

Lógica:
- Identifica o ator: `COALESCE(auth.uid(), NEW.user_id)`.
- Se `ator = NEW.user_id` (criador concluiu a própria tarefa) → não faz nada.
- Caso contrário, insere em `notifications`:
  - `user_id` = `NEW.user_id` (criador)
  - `workspace_id` = `NEW.workspace_id`
  - `type` = `'task_completed'`
  - `payload` = `{ task_id, task_title, completed_by, completed_by_name }` (nome buscado em `profiles`).
- Em UPDATE inverso (true → false) nada acontece.

### 2. Edge function `send-push`
Adicionar branch para `notif.type === 'task_completed'`:
- Título: `✅ Tarefa concluída`
- Body: `"<Nome> finalizou: <task_title>"`
- URL: `/today?task=<task_id>`

### 3. Frontend
- `src/store/notificationStore.ts`: incluir `'task_completed'` na lista de tipos relevantes.
- `src/components/NotificationBell.tsx`: renderizar ícone/label próprio (`CheckCircle2`, "Tarefa concluída", abrir a tarefa).
- `src/components/MentionNotifier.tsx`: toast para o tipo `task_completed` redirecionando para a tarefa.

## Critérios de aceitação
- C1: Usuário A cria tarefa e delega para B; B marca como concluída → A recebe notificação no sino + push em < 2s.
- C2: A conclui a própria tarefa → nenhuma notificação extra.
- C3: Reabrir + concluir de novo gera nova notificação.
- C4: Notificação mostra nome legível (display_name → email prefix → "Usuário").
- C5: Clicar abre o painel da tarefa correta.

## Detalhes técnicos
- Trigger usa `SECURITY DEFINER` + `SET search_path = public` (padrão dos triggers existentes).
- Sem alteração de RLS — `notifications` já permite insert quando `auth.uid() IS NOT NULL`.
- Realtime já está ativo em `notifications` (usado pelo sino) — nada a configurar.
