import { useCallback } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useRecurringEditStore } from '@/store/recurringEditStore';
import { addExdateToRecurrence, rewriteRecurrenceAnchor } from '@/lib/recurrence';
import type { Task } from '@/types/task';
import { toast } from 'sonner';

/**
 * Returns a function that applies a partial update to a task. If the task
 * is recurring AND the update touches scheduling fields (date/time/duration),
 * the user is asked whether to apply the change to a single occurrence or
 * to the whole series.
 *
 * - "series": just calls updateTask with the supplied updates.
 * - "single": adds an EXDATE to the original task for `occurrenceDate`,
 *             then creates a new standalone (non-recurring) task with the
 *             new scheduling values copied from the original.
 */
export function useUpdateTaskWithRecurrencePrompt() {
  const tasks = useTaskStore((s) => s.tasks);
  const updateTask = useTaskStore((s) => s.updateTask);
  const addTask = useTaskStore((s) => s.addTask);
  const ask = useRecurringEditStore((s) => s.ask);

  return useCallback(
    async (
      taskId: string,
      updates: Partial<Task>,
      opts?: { occurrenceDate?: string; changeLabel?: string }
    ) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      const isRecurring = !!task.recurrenceRule;
      const touchesSchedule =
        updates.dueDate !== undefined ||
        updates.dueTime !== undefined ||
        updates.durationMinutes !== undefined;

      // Only treat as a rule edit when the recurrence value actually changes.
      // Date pickers often send the existing recurrenceRule together with
      // date/time edits; that must still go through the occurrence prompt.
      const touchesRule =
        updates.recurrenceRule !== undefined &&
        (updates.recurrenceRule ?? null) !== (task.recurrenceRule ?? null);

      // Non-recurring, rule edit, or change unrelated to scheduling → just update.
      if (!isRecurring || !touchesSchedule || touchesRule) {
        await updateTask(taskId, updates);
        return;
      }

      // Ask the user.
      const occurrenceDate = opts?.occurrenceDate ?? task.dueDate ?? undefined;
      const mode = await ask({
        taskId,
        occurrenceDate: occurrenceDate || '',
        updates,
        changeLabel: opts?.changeLabel,
      });

      if (mode === null) return; // cancelled

      if (mode === 'series') {
        // When the series anchor moves to a new date/time, rewrite the
        // stored recurrence string so DTSTART/EXDATEs match the new
        // anchor — otherwise the rule will keep producing ghost
        // occurrences at the old time and the calendar-dedup logic
        // can wipe the task entirely.
        const seriesUpdates: Partial<Task> = { ...updates };
        if (task.recurrenceRule) {
          const newDate =
            updates.dueDate !== undefined
              ? (updates.dueDate as string | null) ?? task.dueDate
              : task.dueDate;
          const newTime =
            updates.dueTime !== undefined
              ? (updates.dueTime as string | null)
              : task.dueTime ?? null;
          if (newDate) {
            seriesUpdates.recurrenceRule = rewriteRecurrenceAnchor(
              task.recurrenceRule,
              newDate,
              newTime,
            );
          }
        }
        await updateTask(taskId, seriesUpdates);
        return;
      }

      // mode === 'single'
      if (!occurrenceDate || !task.recurrenceRule || !task.dueDate) {
        // Fallback: behave as series if we can't isolate the occurrence.
        await updateTask(taskId, updates);
        return;
      }

      try {
        const newRule = addExdateToRecurrence(
          task.recurrenceRule,
          task.dueDate,
          task.dueTime,
          occurrenceDate
        );

        // Build the standalone task with the *new* scheduling values.
        const newDueDate =
          updates.dueDate !== undefined ? (updates.dueDate as string | null) : occurrenceDate;
        const newDueTime =
          updates.dueTime !== undefined ? (updates.dueTime as string | null) : task.dueTime ?? null;
        const newDuration =
          updates.durationMinutes !== undefined
            ? (updates.durationMinutes as number | null)
            : task.durationMinutes ?? null;

        // Cria a nova tarefa standalone SEM copiar o googleCalendarEventId
        // (senão o mesmo evento do GCal fica linkado a duas tarefas → duplica).
        // O addTask cria um novo evento próprio para essa nova ocorrência.
        const createdTask = await addTask({
          title: task.title,
          description: task.description ?? '',
          priority: task.priority,
          dueDate: newDueDate ?? undefined,
          dueTime: newDueTime ?? undefined,
          durationMinutes: newDuration ?? undefined,
          projectId: task.projectId ?? undefined,
          sectionId: task.sectionId ?? undefined,
          labels: task.labels,
          assigneeIds: task.assigneeIds,
        } as any);
        if (!createdTask) throw new Error('Falha ao criar a ocorrência remanejada');

        // Mantém o googleCalendarEventId da série original (não limpar!),
        // só atualiza a regra para excluir a ocorrência movida.
        await updateTask(taskId, { recurrenceRule: newRule } as any);
      } catch (e) {
        console.error('single-occurrence edit failed', e);
        toast.error('Falha ao editar apenas esta ocorrência');
      }
    },
    [tasks, updateTask, addTask, ask]
  );
}
