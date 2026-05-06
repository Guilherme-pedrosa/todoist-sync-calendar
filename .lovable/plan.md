## Objetivo

Remover Google Calendar do runtime, eliminar a regressão "tarefa apagada volta", consertar o sino de notificações do chat e exibir nomes legíveis em comentários. Sem mexer em RLS. Sem republicar nada automaticamente.

Boa notícia: o item de **latência entre colaboradores** (refatoração de `realtimeTasks.ts` + actions atômicas no `taskStore`) já foi entregue na rodada anterior — `applyTaskUpsertFromDb`, `applyTaskDelete`, `applyTaskAssigneeChange`, `applyTaskLabelChange`, `applyMeetingInvitationChange`, `applyProjectUpsertFromDb`, `applyProjectDelete` existem e o realtime aplica payload incremental sem refetch global. Vou apenas validar que nada do plano abaixo regrida isso.

---

## 1) Remover Google Calendar do runtime

Estratégia: deletar o caminho de execução, não esconder atrás de flag. Manter as colunas `google_calendar_event_id` / `gcal_event_id` no banco (elas são nullable e não atrapalham — mexer em schema agora não tem ganho).

### `src/store/taskStore.ts`
- Remover funções: `createGoogleCalendarEvent`, `updateGoogleCalendarEvent`, `deleteGoogleCalendarEvent`, `syncGoogleCalendarEvents`, `cleanupLocalCalendarDuplicates`, `isGoogleSyncPaused`, helper `GOOGLE_CALENDAR_FUNCTION_URL`.
- Em `fetchData()`: remover o bloco `ENABLE_GOOGLE_CALENDAR ? cleanup… : …` e o `syncedTasks`. Passa a ser só `tasks: (tasksRes.data || []).map(mapDbTaskToTask)`.
- Em `addTask` (~789): remover bloco `if (newTask.googleCalendarEventId) … createGoogleCalendarEvent …`.
- Em `updateTask` (~908): remover os três ramos de update/create/delete de GCal event.
- Em `deleteTask` (~991): remover o `if (task?.googleCalendarEventId) await deleteGoogleCalendarEvent(...)`. **Esse é o fix do BUG das tarefas zumbi**: sem sync, nada reinjeta.
- Em recurrence completion (~1080–1094): remover chamada que cria próximo evento no GCal.
- Manter `googleCalendarEventId` no tipo `Task` e no mapping (read-only) para não quebrar `Database` types — não é gravado em fluxo novo.
- Remover import de `ENABLE_GOOGLE_CALENDAR`.

### `src/contexts/AuthContext.tsx`
- Remover `ENABLE_GOOGLE_CALENDAR` e os 3 blocos protegidos por ela (refresh token, query a `google_tokens`, disconnect endpoint). Substituir por um `connectGoogleCalendar`/`disconnectGoogleCalendar` no-op (ou remover do contexto se nenhum consumer ainda chamar — vou checar). Mais simples: remover totalmente e ajustar consumers em `SettingsPage.tsx`.

### `src/pages/SettingsPage.tsx`
- Remover seções dentro de `ENABLE_GOOGLE_CALENDAR && (...)` (cards de conexão/cleanup/duplicados).
- Remover entrada na nav (`...(ENABLE_GOOGLE_CALENDAR ? [...] : [])`).
- Remover handler `cleanup-duplicates` que faz `fetch` à edge function.
- Remover import.

### `src/pages/AppLayout.tsx`
- Remover bloco que escuta callback OAuth (`ENABLE_GOOGLE_CALENDAR` + `exchange-code`).
- Remover import.

### `src/pages/CalendarCallback.tsx`
- Apagar arquivo. Remover rota correspondente em `src/App.tsx`.

### `src/components/AppSidebar.tsx`
- Remover bloco `ENABLE_GOOGLE_CALENDAR && (...)` (botão Calendar) e import.

### `src/components/ScheduleMeetingDialog.tsx`
- Remover branch `if (ENABLE_GOOGLE_CALENDAR)` que invoca a edge `google-calendar` e grava `gcal_event_id`. Mantém só a criação interna do meeting.
- Remover toggle de UI gated pela flag.
- Remover import.

### `src/components/AIAssistantPanel.tsx`
- Remover dois blocos que usam `ENABLE_GOOGLE_CALENDAR` (tool list-events e create-event).
- Ajustar prompt do assistant para não mencionar Google Calendar como fonte de agenda (a "agenda" passa a ser as `tasks` com `dueDate`/`dueTime`).
- Remover import.

### `src/config/featureFlags.ts`
- Remover `ENABLE_GOOGLE_CALENDAR` (e o comentário). Se o arquivo ficar vazio, manter como placeholder com export vazio para não quebrar imports residuais — mas após o passo acima não deve haver nenhum.

### Edge function & DB
- Remover diretório `supabase/functions/google-calendar/` (deleta arquivo `index.ts`).
- **NÃO** dropar `google_tokens` nem colunas `gcal_event_id` agora — está fora de escopo e exige migration coordenada. Fica como TODO documentado em `mem://`.

### Tipos (`src/types/task.ts`)
- Manter `googleCalendarEventId?` por compatibilidade com `Database` types (é read-only daqui pra frente).

---

## 2) BUG: tarefa apagada volta

Já é resolvido pelo passo 1 (remoção do `syncGoogleCalendarEvents`, que era a causa raiz do reinsert). Validações adicionais:

- Confirmar que `applyTaskDelete` no realtime remove corretamente: já existe em `realtimeTasks.ts`.
- Confirmar que `deleteTask` no store remove local **antes** do DELETE no banco (otimismo) e não restaura em caso de erro silencioso. Vou reler a função e, se necessário, adicionar log de erro explícito (sem rollback automático — o realtime DELETE de outras sessões já garante consistência).

---

## 3) Notificações do chat (sino + leitura)

### `src/store/chatStore.ts` — `markRead`
Adicionar UPDATE em `notifications` marcando como lidas todas as notifs não-lidas daquela conversa para o usuário atual:
```ts
await supabase
  .from('notifications')
  .update({ read_at: now })
  .eq('user_id', uid)
  .is('read_at', null)
  .contains('payload', { conversation_id: conversationId });
```
Como o `notificationStore` é um Zustand separado, também chamar `useNotificationStore.getState().markAllForConversation(conversationId)` para refletir local imediatamente (evita esperar realtime).

### `src/store/notificationStore.ts`
- Estender o canal realtime para escutar `INSERT | UPDATE | DELETE` (hoje só INSERT). No UPDATE com `read_at != null`, atualizar item no estado; no DELETE, remover.
- Adicionar action `markAllForConversation(conversationId)` que zera `read_at` localmente para items cujo `payload.conversation_id === conversationId`.

### `src/components/ChatThread.tsx`
- Trocar a inserção restrita a mencionados por inserção para **todos os participantes da conversa exceto o autor**, mantendo type `chat_mention` quando há menção, e novo type `chat_message` para mensagem normal. Implementação:
  - Buscar `conversation_participants` da conversa (já está no chatStore como `participants`).
  - `participants.filter(p => p.userId !== user.id).map(p => ({ user_id: p.userId, type: mentionedIds.includes(p.userId) ? 'chat_mention' : 'chat_message', workspace_id, payload }))`.
  - Single `insert` em batch.
- `NotificationBell` já trata `chat_mention`; adicionar suporte mínimo a `chat_message` (mesma navegação, label diferente: "Nova mensagem em…").

---

## 4) Identidade em comentários

### `src/components/TaskDetailPanel.tsx`
- Quando perfil não existir, em vez de `id.slice(0, 8)`, fazer fallback: buscar o `email` via uma RPC ou via `auth.users` (sem permissão direta) — alternativa segura: criar/usar campo `email` em `profiles` se existir (verificar schema). Se não existir email no profile, usar literal `"Usuário"`.
- Implementação concreta:
  1. Verificar `profiles.email` no schema (provavelmente existe — `display_name`, `avatar_url` já estão sendo lidos). Se existir, incluir `email` no SELECT.
  2. Display name = `profile.display_name || (profile.email?.split('@')[0]) || 'Usuário'`.
  3. Remover qualquer uso de `c.user_id.slice(0, 8)` (linhas 272 e 825).
- Aplicar mesma lógica em outros pontos que mostram identidade de comentário/atividade: `TaskActivityLog.tsx` (verificar), `AssigneeChip.tsx` (verificar — esses usam outro caminho).

---

## Arquivos tocados (resumo)

**Deletar**: `src/pages/CalendarCallback.tsx`, `supabase/functions/google-calendar/index.ts`.

**Editar**:
- `src/store/taskStore.ts` (purga GCal)
- `src/contexts/AuthContext.tsx`
- `src/pages/SettingsPage.tsx`
- `src/pages/AppLayout.tsx`
- `src/App.tsx` (remover rota)
- `src/components/AppSidebar.tsx`
- `src/components/ScheduleMeetingDialog.tsx`
- `src/components/AIAssistantPanel.tsx`
- `src/config/featureFlags.ts`
- `src/store/chatStore.ts` (markRead estendido)
- `src/store/notificationStore.ts` (UPDATE/DELETE no canal + markAllForConversation)
- `src/components/ChatThread.tsx` (notificar todos os participantes)
- `src/components/NotificationBell.tsx` (suporte a chat_message)
- `src/components/TaskDetailPanel.tsx` (fallback de identidade)

**Memória**: atualizar `mem://integrations/google-calendar` para `mem://constraints/no-google-calendar` (rejeitado, não reintroduzir; agenda é interna; única integração externa = Todoist).

---

## Critérios de aceitação — como vou validar

- **C1** (tarefa apagada): Após mudança, `grep` confirma zero referência ativa a `syncGoogleCalendarEvents`. Manual: deletar tarefa → reload → não retorna.
- **C2** (comentário < 1s): Já validado na rodada anterior (canal global `comments-global-${userId}` + canal por task). Sem regressão.
- **C3** (badge zera < 1s): Após `markRead`, sino zera local imediato + UPDATE no DB. Realtime UPDATE confirma em outras abas.
- **C4** (nome legível): `grep` confirma zero `slice(0, 8)` em código de comentário.
- **C5** (zero dependência GCal): `rg "google-calendar|google_tokens|syncGoogleCalendarEvents|deleteGoogleCalendarEvent|cleanupLocalCalendarDuplicates|ENABLE_GOOGLE_CALENDAR"` em `src/` retorna apenas o tipo legacy `googleCalendarEventId?` em `Task` (read-only por compat com Database types).

---

## Restrições respeitadas

- Zero alteração em RLS.
- Zero alteração em triggers/functions do banco.
- `google_tokens` e colunas GCal **não são dropadas** nesta rodada (fora de escopo, evita migration arriscada).
- Sem republish automático.