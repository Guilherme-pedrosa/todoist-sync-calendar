
# Diagnóstico — Agenda (/upcoming)

## 1. UpcomingPage.tsx

**Filtro principal `visibleTasks`** (linhas 89–99):
- Mantém a tarefa se: usuário não autenticado, OU **não há nenhum assignee nem invitee carregado** (fallback "tarefas antigas"), OU `assigneeIds.includes(currentUserId)`, OU `meetingInviteeIds.includes(currentUserId)`.

**`upcoming`** (101–107): `!completed && !parentId && t.dueDate` (sem corte por data — inclui atrasadas e hoje).

**`tasksByDay`** (154–205): para cada `visibleTask` sem `parentId` com `dueDate`, expande `recurrenceRule` no range visível (`expandOccurrencesInRange`), ou usa `dueDate` direto. Soma `recurringCompletions` como ocorrências "completed".

Como o filtro lida com cada caso:
- **Recém-criadas pelo próprio usuário** → o store insere a tarefa otimista incluindo o próprio `userId` em `assigneeIds` (taskStore L660–666). Então passa o filtro. **Mas** o `cleanupLocalCalendarDuplicates` (L233–256) e o `syncGoogleCalendarEvents` (L326–484) podem rodar em seguida no `fetchData()` do realtime e remover a tarefa (ver causa raiz do bug A).
- **Sem assignee** → fallback do `||` na L95 mantém visível.
- **Recorrentes** → expandidas via rrule.
- **Reuniões com convidados pendentes** → invitee aparece em `meetingInviteeIds`, fica visível.
- **Atrasadas** → visíveis (não há corte).
- **Concluídas** → ocultas no `upcoming`/`tasksByDay`.

## 2. taskStore.ts

**Optimistic update no `addTask`** (L545–700):
1. Resolve workspaceId, faz `INSERT` em `tasks` esperando o retorno (`.select().single()` → L594–603). Não é otimista no DB; é *otimista no store*.
2. Insere `task_labels`, `task_assignees` (L605–618), `reminders` (L620–658).
3. Monta `newTask` localmente já com `assigneeIds = [userId, ...extras]` (L660–665).
4. **`set({ tasks: [newTask, ...state.tasks] })`** — entra no store imediatamente.
5. Em seguida tenta `createGoogleCalendarEvent` (L668–690) e atualiza `google_calendar_event_id`.

**Realtime → `fetchData()`** (L497–543):
- Refaz SELECT completo (sem filtro de range), passa por `cleanupLocalCalendarDuplicates` (L537) e por `syncGoogleCalendarEvents` (L540), e dá `set({ tasks: syncedTasks })` substituindo o array.
- `cleanupLocalCalendarDuplicates` agrupa por `getTaskDuplicateKey(title+date+time)` e **deleta no banco e no array** todas exceto a primeira (L233–256). A ordenação prioriza quem tem `googleCalendarEventId`. Tarefa recém-criada que ainda **não tem** `google_calendar_event_id` perde para uma sincronizada do GCal com mesmo título/horário, é deletada do banco e some da UI.
- `syncGoogleCalendarEvents` (L459–478) ainda apaga "órfãos": qualquer tarefa local com `googleCalendarEventId` não visto na resposta do GCal e dentro da janela é DELETADA (`supabase.from('tasks').delete()`). Em corridas de eventual consistência, isso já reportadamente apagou tarefas legítimas.

**Pontos onde uma tarefa entra no store sem assignees e some**:
- `syncGoogleCalendarEvents` (L439–457): tarefas criadas a partir de eventos do GCal entram **sem** `task_assignees`. Como o filtro da Agenda usa o fallback "lista vazia → mostra", elas aparecem; mas se eventualmente o realtime trouxer a versão do banco com array vazio também, segue visível. Sem bug aqui.
- O bug é o oposto: tarefa do usuário **com** assignees é APAGADA pelo cleanup/orphan logic.

## 3. realtimeTasks.ts

- Único channel: `tasks-realtime-${userId}`, evento `*` em `tasks`, `projects`, `sections`, `task_labels`, `task_assignees`, `meeting_invitations` (L18–26).
- **Sem filtro server-side** — qualquer mudança em qualquer linha que o usuário **possa ler via RLS** dispara `scheduleRefetch` (debounce 400 ms → `fetchData()`).
- Convidado recebe o evento? Sim, desde que a RLS permita SELECT (RLS de `meeting_invitations`/`task_assignees` libera para o convidado). Não há `filter: created_by=eq.X`.

## 4. useUpdateTaskWithRecurrencePrompt.ts — fluxo "apenas esta ocorrência"

Passos (L94–163):
1. Confere `occurrenceDate`, `recurrenceRule`, `dueDate`. Se faltar, faz fallback para série.
2. `addExdateToRecurrence(rule, dueDate, dueTime, occurrenceDate)` gera string com `DTSTART + RRULE + EXDATE` (recurrence.ts L111–142). Usa **horário local do anchor** convertido por `parseISO('YYYY-MM-DDTHH:mm:00')` → **timezone local do navegador** (sem TZID, sem `Z`). Formato `yyyyMMdd'T'HHmmss` floating.
3. Faz `UPDATE tasks SET recurrence_rule = newRule WHERE id = taskId` direto via supabase (L128–132).
4. **Atualiza store local com `setLocalRule(newRule)`** (L133) — antes de qualquer confirmação adicional.
5. Chama `addTask({...})` para criar a ocorrência avulsa com novos valores (L138–149). `addTask` espera o INSERT do banco antes de inserir no store (L594).
6. Se `addTask` retorna `null`, faz **rollback do recurrence_rule** no banco e no store (L150–154). Se erro lança, toast `"Falha ao editar apenas esta ocorrência"`.

**Observações relevantes**:
- O EXDATE não usa TZID, e o `expandOccurrencesInRange` parseia a string com a mesma lógica → consistente em local time **desde que** a hora atual da série coincida com o `dueTime` armazenado. Se a tarefa tem `dueTime = null`, o fallback é `'00:00'` (recurrence.ts L117), gerando EXDATE `T000000` que **não casa** com a hora real da ocorrência expandida → EXDATE é ignorado na expansão e a ocorrência continua aparecendo.
- O store local é atualizado **depois do UPDATE no banco confirmar** (await), e **antes** do `addTask`. Se o realtime chegar entre o UPDATE e o `addTask` finalizar, o `fetchData()` pode rodar sobre estado intermediário e ainda assim ficar consistente — mas a corrida com `cleanupLocalCalendarDuplicates` pode **apagar** a nova ocorrência avulsa (mesmo título, mesma data, mesmo horário que uma instância da série antes do EXDATE propagar no SELECT).
- Não há verificação de `created_by`/RLS antes do INSERT da nova tarefa avulsa; se o `taskId` é uma **reunião** ou tarefa em workspace compartilhado onde o usuário tem leitura mas não escrita em `tasks`, o INSERT falha silenciosamente (`addTask` retorna `null`) e o rollback dispara — produzindo o toast "Falha ao editar apenas esta ocorrência".

## 5. ScheduleMeetingDialog.tsx + delegação

**Ordem dos writes** (handleSubmit, L169–298):
1. `INSERT tasks` (com `is_meeting=true`, `project_id=inboxId`) → retorna `taskId` (L194–213).
2. `INSERT meeting_invitations` em batch (L216–234).
3. `INSERT task_assignees` apenas para o **criador** (L237–240). Erro silenciosamente ignorado.
4. **Não** insere convidados internos como assignees (comentário L242–244): só viram assignee quando aceitam o convite (via trigger `handle_meeting_invitation_response` no banco).
5. `google-calendar` edge function (L260–288) tenta criar evento e atualiza `gcal_event_id` na tarefa.
6. `void fetchData()` (L297) — força refresh.

**Subtarefas via "delegar tarefa completa"**:
- `addTask` no taskStore não copia `task_assignees` da pai automaticamente. A cópia depende do componente que dispara a criação (em geral passa `assigneeIds: parent.assigneeIds`). Não há trigger no banco para herança.

## 6. Comentários

- `TaskDetailPanel.tsx` L195–266: SELECT em `comments` filtrado por `task_id`, depois SELECT em `profiles` para os `user_id` distintos não cacheados (L241–266).
- **RLS `profiles`**:
  - "Users can view own profile": `auth.uid() = user_id`.
  - "Workspace members can view each other profiles": permite SELECT quando viewer e dono compartilham um `workspace_members` (qualquer workspace).
- **Confirmado via SQL** acima. Funciona para usuários no mesmo workspace. **Não funciona** para um convidado externo que tem acesso a uma task via `meeting_invitations` mas **não é membro** de workspace algum em comum — `profiles` não retorna nada, e a UI cai no fallback "Usuário".

## 7. Layout do calendário (Semana)

- Algoritmo em `WeekGrid` L961–1007:
  1. Cria `items` com `startMin/endMin` por evento.
  2. Ordena por `startMin` ascendente, ties por `endMin` desc.
  3. Cluster: enquanto o próximo evento `startMin < clusterEnd`, faz parte do cluster.
  4. Para cada item no cluster, atribui `col = menor inteiro não usado` entre os ainda ativos.
  5. No `flush`, `cols[a]` = max colunas entre os que de fato sobrepõem `a`.
  6. `EventBlock` posiciona: `left: col * (100/cols)%`, `width: (100/cols)% - 4px` (L1138–1158).
- **Por que blocos saem da coluna**: o cálculo de `cols` no `flush` (L982–989) considera **apenas o cluster atual**, mas o `clusterEnd` cresce de forma transitiva (qualquer evento que toque o anterior expande o cluster). Isso já está OK. O problema visual relatado vem de:
  1. `cols` é calculado por evento (`maxCols` local), e dois eventos no mesmo cluster podem ter `cols` diferentes; ao misturar `widthPct = 100/cols` distintos, as colunas não somam 100% e os blocos ficam parciais ou invadem o vizinho.
  2. `MIN_EVENT_HEIGHT = 22` e textos longos no card → `truncate` aparece junto com largura mínima (cluster grande → `1/N` da coluna). Em segunda/terça, vários eventos curtos sobrepostos geram `cols ≥ 3`, cada bloco ocupa ~33% da coluna do dia → texto truncado.
  3. O `width: calc(100/cols% - 4px)` com `cols` variando entre eventos do mesmo cluster gera o "saindo da coluna" (somatório > 100% quando `cols` de um é menor que o real).

Componente/função responsáveis: `WeekGrid` (IIFE em L961–1007) + `EventBlock` (L1137–1158).

## 8. Estilo "concluído"

- `EventBlock` (L1106–1112): `isDone = task.completed || isRecurringCompletion`. `variantClasses` aplica `bg-success/15` etc. Strikethrough no título: `cn('truncate', isDone && 'line-through')` (renderização do título do bloco).
- `TaskItem.tsx` aplica strikethrough quando `task.completed === true`.
- **Caminho onde aparece sem `completed=true`**: ocorrências históricas de `recurring_task_completions` (UpcomingPage L188–200) constroem um `Task` sintético com `completed: true, isRecurringCompletion: true`. Está correto, mas o id é `recurring-completion:${id}` — qualquer comparação por `task.id` em outras telas falha. Não há outro caminho aplicando `line-through` sem `completed`.

---

## Causas raiz dos bugs

### Bug A — Tarefa criada na Agenda some, mas fica no banco

**Cadeia**:
1. `addTask` insere no DB e adiciona ao store imediatamente (taskStore L666). Tarefa **aparece**.
2. Realtime do INSERT em `tasks` dispara `scheduleRefetch` → `fetchData()` em 400 ms.
3. `fetchData` chama `cleanupLocalCalendarDuplicates` (L233–256) e/ou `syncGoogleCalendarEvents` (L459–478):
   - **Cleanup duplicates**: agrupa por `título+date+time`. Se o usuário tem GCal conectado, a sincronização que aconteceu no fetch anterior pode ter trazido um evento com mesmo título/horário (próprio evento criado segundos antes pelo `createGoogleCalendarEvent` retornando assíncrono). A nova tarefa local sem `googleCalendarEventId` ainda fica em segundo lugar na ordenação → **DELETADA do DB** e do array.
   - **Orphan delete**: se a nova tarefa **tem** `googleCalendarEventId` mas o GCal ainda não retorna o evento (latência da API), ela é considerada órfã e **DELETADA**.
4. Resultado: tarefa some da UI; (no banco depende de qual ramo) — quando o usuário diz "fica no banco" é o caso em que o orphan/cleanup falha em apagar (ex.: `delete()` sem checagem de RLS retorna OK mas linha persiste por race) ou que a deleção ainda não propagou.
5. Mesmo cenário ocorre quando usuário **convidado** vê a reunião: para ele Google Sync não roda nessa tarefa, mas o `cleanupLocalCalendarDuplicates` continua agrupando — se ele não tem evento gêmeo, fica intacto. Bug é específico de quem tem GCal conectado e/ou de quem cria pela Agenda.

**Hipótese principal**: `cleanupLocalCalendarDuplicates` + `syncGoogleCalendarEvents` rodam em todo `fetchData()` sem janela de proteção para tarefas recém-criadas, deletando-as. Antes era um patch para Google Calendar; hoje é o pior ofensor da Agenda.

### Bug B — "Editar apenas esta ocorrência" do ALMOÇO de hoje não muda nada

**Hipóteses, em ordem de probabilidade**:
1. **EXDATE com horário desalinhado**: se a série armazenada tem `DTSTART:...T130000` mas a expansão consulta `dueTime='13:00'` enquanto o `addExdateToRecurrence` foi chamado com `dueTime` diferente (ex.: `null`), o EXDATE gerado fica `T000000` e **não suprime** a ocorrência → o item original continua aparecendo, lado a lado com a nova "avulsa". Visualmente parece "não mudou nada" (na verdade duplicou).
2. **`addTask` retorna `null`** porque a tarefa avulsa entra no fluxo do `cleanupLocalCalendarDuplicates` no `fetchData()` que o realtime do UPDATE de `recurrence_rule` dispara: a nova ocorrência tem mesmo `título+date+time` que uma expansão "viva" da série (antes do EXDATE estar refletido no SELECT) → é deletada como duplicata. Rollback do hook restaura o rule original → ocorrência também volta. Resultado: nada muda.
3. **RLS/ownership**: ALMOÇO é tarefa em workspace compartilhado (WEDO). `addTask` insere com `user_id=auth.uid()` e força `project_id` da pai original (`task.projectId`). Se esse projeto exige `auth.uid() = user_id` no INSERT (policy `tasks_insert`) **e** `has_project_access`, mas a tarefa original pertence a outro `user_id`, a nova insertada com `user_id` do usuário atual passa — exceto se `has_project_access` for `false` para esse projeto naquele workspace. Improvável aqui (caixa de entrada pessoal), mas possível para reuniões.
4. **Timing do realtime + `setLocalRule`**: o `setLocalRule` otimista é sobrescrito quando `fetchData()` chega 400 ms depois com a `recurrence_rule` antiga (caso o UPDATE não tenha propagado ao SELECT no replica). A combinação com o `addTask` falhando reverte tudo.

---

## Ordem recomendada de correção

1. **Desligar o `cleanupLocalCalendarDuplicates` e o "orphan delete" do `syncGoogleCalendarEvents`** para tarefas criadas nos últimos N segundos (janela de quarentena de ~30 s baseada em `createdAt`). Eliminar `supabase.delete()` cego em `fetchData()`. *(resolve bug A e desbloqueia bug B)*
2. **Corrigir `addExdateToRecurrence`**: derivar a hora do `EXDATE` a partir do `DTSTART` real da regra (parsear `DTSTART:` se presente), não do `dueTime` da tarefa. Garantir que se `dueTime` for `null`, ler `BYHOUR/BYMINUTE` ou usar `floating date` (`VALUE=DATE`). *(corrige bug B principal)*
3. **No hook**, **não** atualizar store local com `setLocalRule` antes do `addTask` retornar — agrupar em uma única transição e só dar `setState` quando ambos OK. Considerar `useTaskStore.setState` adicionando o novo task **junto** com a mudança de rule, dentro de um `try` único. *(blinda contra realtime intermediário)*
4. **Substituir o channel realtime único por filtros mais granulares** ou ao menos suprimir o `fetchData` quando o evento veio de uma operação local em curso (flag "I just wrote, ignore next echo"). *(reduz cascata)*
5. **RLS de `profiles`** estender para "compartilha acesso a uma task" (LEFT JOIN com `task_assignees`/`meeting_invitations`) — só assim convidado externo vê o autor do comentário.
6. **Layout WeekGrid**: usar `cols` por **cluster** (constante para todos do cluster, = max colunas reais), não por evento. Garantir que `Σ widthPct = 100%` e remover o `-4px` de `width` (mover para `padding`).
7. **EventBlock strikethrough**: nada a corrigir; já está acoplado a `isDone`.

---

## Detalhes técnicos

- Arquivos-chave: `src/store/taskStore.ts` (L233–256, 326–484, 545–700, 497–543), `src/lib/realtimeTasks.ts` (todo), `src/hooks/useUpdateTaskWithRecurrencePrompt.ts` (L94–163), `src/lib/recurrence.ts` (L111–142), `src/pages/views/UpcomingPage.tsx` (L89–205, 961–1007, 1100–1158), `src/components/ScheduleMeetingDialog.tsx` (L169–298), `src/components/TaskDetailPanel.tsx` (L195–266).
- RLS atual de `profiles` confirmada via `pg_policy`: 4 políticas (own + workspace members).
- `has_task_access` já considera `task_assignees` e `meeting_invitations`, mas `profiles` **não** usa essa função — é a lacuna do item 5.
