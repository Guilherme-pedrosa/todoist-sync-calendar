import { useCallback } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useRecurringEditStore } from '@/store/recurringEditStore';
import { addExdateToRecurrence, addWeekdayExdatesToRecurrence, removeWeekdayFromRecurrence } from '@/lib/recurrence';
import { toast } from 'sonner';

/**
 * Returns a function that deletes a task. If the task is recurring, the user
 * is asked whether to delete only this occurrence or the whole series.
 *
 * - "series": fully deletes the task (and its Google Calendar event).
 * - "single": adds an EXDATE to the recurrence rule for `occurrenceDate`,
 *             keeping the series alive but skipping that day.
 *
 * Returns one of: 'deleted' | 'exdated' | 'cancelled'
 */
export function useDeleteTaskWithRecurrencePrompt() {
  const tasks = useTaskStore((s) => s.tasks);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const ask = useRecurringEditStore((s) => s.ask);

  return useCallback(
    async (
      taskId: string,
      opts?: { occurrenceDate?: string; rangeStart?: string; rangeEnd?: string }
    ): Promise<'deleted' | 'exdated' | 'cancelled'> => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return 'cancelled';

      // Non-recurring → delete straight away.
      if (!task.recurrenceRule) {
        await deleteTask(taskId);
        return 'deleted';
      }

      const occurrenceDate = opts?.occurrenceDate ?? task.dueDate ?? undefined;

      const mode = await ask({
        taskId,
        occurrenceDate: occurrenceDate || '',
        updates: {},
        operation: 'delete',
        changeLabel: 'exclusão de uma ocorrência',
      });

      if (mode === null) return 'cancelled';

      if (mode === 'series') {
        await deleteTask(taskId);
        return 'deleted';
      }

      if (!occurrenceDate || !task.dueDate) {
        toast.error('Não consegui identificar qual ocorrência remover');
        return 'cancelled';
      }

      try {
        const newRule = mode === 'weekday'
          ? removeWeekdayFromRecurrence(task.recurrenceRule, task.dueDate, occurrenceDate) ??
            (opts?.rangeStart && opts?.rangeEnd
              ? addWeekdayExdatesToRecurrence(
                  task.recurrenceRule,
                  task.dueDate,
                  task.dueTime,
                  occurrenceDate,
                  opts.rangeStart,
                  opts.rangeEnd
                )
              : null)
          : addExdateToRecurrence(
              task.recurrenceRule,
              task.dueDate,
              task.dueTime,
              occurrenceDate
            );
        if (!newRule) {
          await deleteTask(taskId);
          return 'deleted';
        }
        await updateTask(taskId, { recurrenceRule: newRule });
        toast.success(mode === 'weekday' ? 'Ocorrências deste dia removidas' : 'Ocorrência removida', {
          description: mode === 'weekday'
            ? 'A série continua ativa nos outros dias visíveis.'
            : 'As demais ocorrências da série continuam ativas.',
        });
        return 'exdated';
      } catch (e) {
        console.error('single-occurrence delete failed', e);
        toast.error('Falha ao remover apenas esta ocorrência');
        return 'cancelled';
      }
    },
    [tasks, deleteTask, updateTask, ask]
  );
}
