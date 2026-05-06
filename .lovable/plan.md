# Plano — Etapa 0 do Prompt de Correção Total: Instrumentação

Vou aplicar **APENAS instrumentação** (logs estruturados). Nenhuma lógica é alterada. Sem correção, sem mudança de RLS, sem mexer em recurrence/WeekGrid/EventBlock/types/task.

## Arquivos tocados (4)

### 1. `src/store/taskStore.ts` — função `addTask` + `ensureFreshSession`
- Em `ensureFreshSession`: log `[addTask] step=session-check` no início; warn em cada caminho de retorno null (`reason=session-null`, `reason=refresh-failed`).
- Em `addTask`:
  - `console.info('[addTask] step=resolve-workspace', { workspaceId, targetProjectId })`
  - `console.info('[addTask] step=resolve-project', { projectId: targetProjectId })`
  - `console.info('[addTask] step=insert-payload', insertPayload)`
  - `console.info('[addTask] step=insert-response', { data, error })`
  - `console.info('[addTask] step=local-insert', { id: data?.id })`
  - `console.warn('[addTask] aborted reason=...')` em qualquer return null/throw.

### 2. `src/components/QuickAddDialog.tsx` — handler `submit`
- `console.info('[QuickAdd] submit-start', { title, date, projectId, assigneeIds })` no início.
- `console.info('[QuickAdd] submit-end', { created: !!created, id: created?.id })` após resolver.
- `console.error('[QuickAdd] submit-error', err)` no catch (já tem console.error, troco prefixo).

### 3. `src/lib/realtimeTasks.ts` — handler de eventos
- Trocar `scheduleRefetch` por wrapper: `(payload) => { console.info('[realtime] event', { table: payload.table, eventType: payload.eventType, newId: payload.new?.id }); console.info('[realtime] triggering fetchData reason=postgres_changes'); scheduleRefetch(); }`.

### 4. `src/pages/views/UpcomingPage.tsx` — useMemo `visibleTasks`
- Após o `tasks.filter(...)`, log throttled (com `useRef` de timestamp para max 1x/2s):
  `console.info('[UpcomingPage] visible-count', visibleTasks.length, 'total-count', tasks.length)`.

## Regras seguidas
- Sem tocar em: `recurrence.ts`, `WeekGrid*`, `EventBlock*`, `types/task.ts`, RLS, Google Calendar.
- Logs ficam até o bug ser fechado.
- Nenhuma mudança comportamental — só `console.info/warn/error`.

## Próximo passo (após você validar logs)
Você reproduz o bug uma vez no preview com console aberto, me cola a sequência de logs `[QuickAdd]`, `[addTask]`, `[realtime]`, `[UpcomingPage]` e a aba Network filtrada por `tasks`. Aí eu identifico o caso (A/B/C/D) e aplico **só** a correção da Etapa 3.
