## Escopo & garantias

- **Não toco**: `src/pages/views/UpcomingPage.tsx`, `src/components/WeekGrid*`, `src/components/EventBlock*`, `src/hooks/useUpdateTaskWithRecurrencePrompt.ts`, `src/lib/recurrence.ts`, RLS de `tasks` / `task_assignees` / `meeting_invitations`, e o shape de `src/types/task.ts`.
- **Não mudo** o filtro do `taskStore`. Todo agrupamento/ordenação/filtro novo da view de Tarefas vive em hooks/selectors locais (`src/lib/tasks/*`).
- **Detalhe da tarefa**: vou **compartilhar** o `TaskDetailPanel.tsx` atual sem mudanças visuais. Qualquer ajuste visual nele eu trago para sua aprovação antes.

## Estado atual do "filtro por responsável" (auditoria)

Hoje **não existe** um filtro "mostrar só tarefas de X" como o Todoist não tem. O que existe é:
- **Agrupamento por responsável** no Kanban (`KanbanBoard.tsx` → `GroupBy='assignee'`, `BoardGroupToolbar` em `ProjectPage.tsx` linhas 441-479, opção "Responsável").
- Atribuição via `AssigneeChip.tsx` + tabela `task_assignees` (campo derivado `assigneeIds` no `Task`).
- Não há persistência por view, nem multi-seleção, nem filtro real em lista.

**Como preservo + evoluo (sem remover):**
- Mantenho `BoardGroupToolbar` e `GroupBy='assignee'` exatamente como estão.
- Adiciono um **filtro novo e separado** (`AssigneeFilterMenu`) que coexiste com o agrupamento — filtro restringe linhas, agrupamento organiza colunas/seções.
- Multi-seleção, avatar + contador no menu, persistência em `localStorage` por view (`taskflow:assigneeFilter:<viewKey>`), atalho `F` via listener global escopado à rota de tarefas.

## Mapa de arquivos

**Novos** (todos fora de `/upcoming`):
- `src/lib/tasks/quickAddParser.ts` — parser NL (datas, `#projeto`, `!p1..p4`, `@etiqueta`, `+responsável`).
- `src/lib/tasks/grouping.ts` — agrupa por "Atrasado / Hoje / dia futuro" e gera chaves estáveis.
- `src/lib/tasks/useTaskListView.ts` — selector da view (filtro por responsável + agrupamento + ordem manual). Lê `useTaskStore` por seletores primitivos (regra Zustand já memorizada).
- `src/lib/tasks/useCollapsedSections.ts` — persistência `localStorage` por `viewKey`.
- `src/lib/tasks/useAssigneeFilter.ts` — multi-seleção + persistência por `viewKey` + atalho `F`.
- `src/components/tasks/TaskRow.tsx` — linha densa estilo Todoist (bolinha colorida por prioridade, ícones discretos: subtarefa `chevron + N/M`, recorrência, comentário, anexo, mini-avatar).
- `src/components/tasks/TaskRowHoverActions.tsx` — datepicker inline, prioridade, atribuir, comentar, more-menu (mover/duplicar/excluir). Tap-once em touch.
- `src/components/tasks/InlineSubtaskAdder.tsx` — "+ Adicionar subtarefa" inline (Enter cria, Esc cancela).
- `src/components/tasks/SectionHeader.tsx` — header colapsável; no grupo "Atrasado" mostra botão "Reagendar" → datepicker → confirmação.
- `src/components/tasks/QuickAddInput.tsx` — campo "Adicionar tarefa" com tokens reconhecidos em preview.
- `src/components/tasks/AssigneeFilterMenu.tsx` — botão + popover com avatares e contador.
- `src/components/tasks/RescheduleOverdueDialog.tsx` — confirmação do reagendamento em massa.
- `src/components/tasks/TaskDndContext.tsx` — wrapper `@dnd-kit` para reorder + cross-section.

**Editados** (mínimo, só plumbing):
- `src/components/TaskList.tsx` — substitui mapa de linhas por `TaskRow`, adiciona `SectionHeader`, integra `useTaskListView` + `useAssigneeFilter` + DnD. Mantém props, comportamento atual de "completed" e contagens.
- `src/pages/views/InboxPage.tsx`, `TodayPage.tsx`, `ProjectPage.tsx`, `LabelPage.tsx` — passam `viewKey` ao `TaskList` e renderizam `AssigneeFilterMenu` no header. **Não altero** `BoardGroupToolbar` nem o Kanban.
- `src/components/AddTaskForm.tsx` — internamente passa pelo `quickAddParser`; se nada for reconhecido, segue 100% como hoje (zero regressão do "Adicionar tarefa" simples).

**Não toco** em: `UpcomingPage.tsx`, `WeekGrid*`, `EventBlock*`, `ScheduleMeetingDialog.tsx`, `useUpdateTaskWithRecurrencePrompt.ts`, `recurrence.ts`, `taskStore.ts` (filtros), `realtimeTasks.ts`.

## Detalhes por item do briefing

1. **Seções colapsáveis**: `SectionHeader` + `useCollapsedSections('viewKey')`. "Atrasado" em `text-destructive`, com botão "Reagendar" → `RescheduleOverdueDialog` (datepicker shadcn com `pointer-events-auto`) → atualiza em batch via `updateTask` existente do store (1 chamada por task, dentro de um `Promise.all`). Sem tocar em recorrência.

2. **Hover actions**: `TaskRowHoverActions` aparece em `group-hover` no desktop e ao primeiro tap em touch (sem abrir detalhe — segundo tap abre). Reusa `DatePickerPopover.tsx`, `AssigneeChip.tsx`, e ações já existentes do store.

3. **Subtarefa inline**: `InlineSubtaskAdder` embaixo da pai expandida. Indentação `pl-6` por nível. Header da pai exibe `chevron + 0/N` quando tem filhos. Reusa `addTask({ parentId })` do store.

4. **Quick add NL parser** (`quickAddParser.ts`):
   - Datas pt-BR: `hoje`, `amanhã`, `amanhã 14h`, `seg..dom/sex`, `dd/mm`, `dd/mm/aaaa`, `todo dia útil 9h`, `todo dia 5`. Saída: `{ dueDate, dueTime, recurrence? }`.
   - `#nome` → resolve por `projects[].name` (case/acentos-insensitive).
   - `!p1..!p4` → `priority: 1..4`.
   - `@nome` → label existente; se não existir, ignora silenciosamente (não cria sem confirmação).
   - `+nome` → membro do projeto resolvido; multi-`+` permitido.
   - **Preview de tokens** abaixo do input, chips removíveis. **Fallback**: se nada reconhece, comportamento idêntico ao `AddTaskForm` atual.

5. **Filtro por responsável** (mantido + refinado): conforme auditoria acima. Multi-seleção, avatares, contador, persistência por `viewKey`, atalho `F`. **Coexiste** com agrupamento Kanban — nunca substitui.

6. **DnD** via `@dnd-kit/core` + `@dnd-kit/sortable` (já em uso no Kanban):
   - Ordem manual persistida em `localStorage` por `viewKey` (`taskflow:taskOrder:<viewKey>`) — mantém a abordagem já presente no `TaskList` (vi `orderOverride` nas linhas 232-244).
   - Mover entre seções de data muda `dueDate` via `updateTask` (Hoje→amanhã = +1d; Atrasado→Hoje = `today`). Não toca em recorrência.
   - Kanban segue intocado.

7. **Densidade Todoist**: bolinha do checkbox colorida por prioridade (P1 `--destructive`, P2 laranja `--primary`, P3 azul, P4 `--muted-foreground`). Ícones `lucide` em `h-3.5 w-3.5 text-muted-foreground`. Padding linha `py-2`, font `text-sm`. Tudo via tokens semânticos do `index.css` (sem cores hard-coded).

## Smoke test obrigatório no Calendário (sem código alterado lá)

1. Abrir `/upcoming` → confirmar que grade semanal renderiza igual.
2. Criar tarefa nova com data futura via `QuickAddInput` da Inbox ("amanhã 14h ligar fulano") → abrir `/upcoming` → tarefa aparece na grade no horário certo.
3. Abrir reunião existente "REUNIÃO RESULTADO FINANCEIRO + TASKFLOW" no `/upcoming` → painel de detalhe abre normalmente, convidados visíveis.
4. Mover ALMOÇO de hoje via "editar apenas esta ocorrência" → confirmar que o fluxo de recorrência segue chamando `useUpdateTaskWithRecurrencePrompt` sem alteração.
5. Console limpo: sem novos warnings de Zustand "infinite update".

## Dependência

- `@dnd-kit/core` + `@dnd-kit/sortable` (verificar `package.json`; se faltar, `bun add` antes de começar).

## O que **não** vou fazer nesta onda

- Sem mudar visual do `TaskDetailPanel`.
- Sem novos campos no DB.
- Sem migração SQL.
- Sem mexer em `/upcoming` ou recorrência.
