## Objetivo
Adicionar um campo **"Informado"** nas tarefas, ao lado de "Responsável". Quem estiver listado como informado:
- Recebe notificação (sino + push) ao ser delegado, ao haver atualização da tarefa e ao ser concluída.
- É adicionado à conversa da tarefa (chat) e recebe mensagens de chat.
- **NÃO** vê a tarefa na própria agenda (Hoje, Próximas, Kanban "Por pessoa", etc.).

## 1. Banco de dados
Reaproveitar `task_assignees` adicionando uma coluna `role`:

```sql
ALTER TABLE public.task_assignees
  ADD COLUMN role text NOT NULL DEFAULT 'responsible'
  CHECK (role IN ('responsible','informed'));
CREATE INDEX idx_task_assignees_role ON public.task_assignees(task_id, role);
```

Ajustes nos triggers existentes (mantendo nomes):
- `handle_task_assignee_notification` → continua disparando para qualquer role; payload ganha `role` para o front diferenciar texto.
- `handle_task_assignee_to_conversation` → continua adicionando informados ao conversation/chat.
- `handle_task_completion_notification` (já existe) → notificar **criador + todos os informados** (exceto o ator).
- Novo trigger `handle_task_update_notification` em `AFTER UPDATE OF title, description, due_date, due_time, priority, project_id ON tasks`: cria notification `task_updated` para todos os informados (≠ ator).

## 2. Frontend — TaskDetailPanel
- Nova `DetailRow icon={Eye} label="Informado"` logo abaixo de "Responsável".
- Componente `<AssigneeChip />` reaproveitado, mas operando sobre `informedIds` (filtrar por `role`).
- Persistência: insert/delete em `task_assignees` com `role='informed'`.

## 3. Frontend — agenda / filtros
- `taskStore` separa `assigneeIds` (apenas role=responsible) e `informedIds` (apenas role=informed).
- `TodayPage`, `UpcomingPage`, `KanbanBoard` (colunas por usuário), `WorkloadPage` continuam usando `assigneeIds` → informados não aparecem na agenda automaticamente.
- `NotificationBell` ganha tipo `task_updated` e mantém `task_completed`/`task_assigned` (texto adaptado a `role: 'informed'` quando aplicável).

## 4. Edge function `send-push`
Adicionar branch para `task_updated`:
- Título: `📝 Tarefa atualizada`
- Body: `<task_title>` + breve descrição do campo alterado.
- URL: `/today?task=<task_id>` (ou painel da tarefa).

## 5. Chat
`getTaskChatRecipientIds` já lê `task_assignees` inteira → informados já entram automaticamente. Sem alteração.

## Critérios de aceitação
- C1: Adicionar usuário como Informado → ele recebe sino + push de "atribuição" (texto: "Você foi adicionado como informado").
- C2: Editar tarefa (título/data/projeto) → informados recebem notificação `task_updated`.
- C3: Concluir tarefa → informados + criador recebem `task_completed`.
- C4: Tarefa não aparece na Hoje/Próximas/Kanban do informado.
- C5: Conversa da tarefa inclui o informado e ele recebe mensagens.

## Detalhes técnicos
- `role` default `responsible` mantém compatibilidade com todas as linhas atuais.
- Filtros do front passam a usar `assigneeIds` (responsáveis) para agenda e `informedIds` para badges.
- RLS de `task_assignees` continua igual (não depende de role).
