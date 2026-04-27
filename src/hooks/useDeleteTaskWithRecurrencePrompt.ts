import { useCallback } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useRecurringEditStore } from '@/store/recurringEditStore';
import { addExdateToRecurrence } from '@/lib/recurrence';
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
      opts?: { occurrenceDate?: string }
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
        changeLabel: 'excluir tarefa recorrente',
      });

      if (mode === null) return 'cancelled';

      if (mode === 'series') {
        await deleteTask(taskId);
        return 'deleted';
      }

      // mode === 'single'
      if (!occurrenceDate || !task.dueDate) {
        // Can't isolate a specific date → fall back to deleting the series.
        await deleteTask(taskId);
        return 'deleted';
      }

      try {
        const newRule = addExdateToRecurrence(
          task.recurrenceRule,
          task.dueDate,
          task.dueTime,
          occurrenceDate
        );
        await updateTask(taskId, { recurrenceRule: newRule });
        toast.success('Ocorrência removida', {
          description: 'As demais ocorrências da série continuam ativas.',
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
