import { useCallback } from 'react';
import { ensureFreshSession, useTaskStore } from '@/store/taskStore';
import { useRecurringEditStore } from '@/store/recurringEditStore';
import { useUndoStore } from '@/store/undoStore';
import { addExdateToRecurrence, rewriteRecurrenceAnchor, nextOccurrence } from '@/lib/recurrence';
import type { Task } from '@/types/task';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';


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
  const fetchData = useTaskStore((s) => s.fetchData);
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
        // Build the standalone task with the *new* scheduling values.
        const newDueDate =
          updates.dueDate !== undefined ? (updates.dueDate as string | null) : occurrenceDate;
        const newDueTime =
          updates.dueTime !== undefined ? (updates.dueTime as string | null) : task.dueTime ?? null;
        const newDuration =
          updates.durationMinutes !== undefined
            ? (updates.durationMinutes as number | null)
            : task.durationMinutes ?? null;

        // Estratégia anti-duplicata: em vez de EXDATE (que sofre desalinhamento
        // entre DTSTART floating e horário local), avançamos a ÂNCORA da série
        // para a próxima ocorrência após `occurrenceDate`. Isso remove a
        // ocorrência editada da série de forma determinística e deixa a tarefa
        // avulsa ocupar o slot remanejado.
        const seriesUpdates: Partial<Task> = {};
        const next = nextOccurrence(task.recurrenceRule, occurrenceDate, task.dueTime ?? undefined);
        if (next) {
          seriesUpdates.dueDate = next.dueDate;
          if (next.dueTime !== undefined) seriesUpdates.dueTime = next.dueTime;
          seriesUpdates.recurrenceRule = rewriteRecurrenceAnchor(
            task.recurrenceRule,
            next.dueDate,
            next.dueTime ?? task.dueTime ?? null,
          );
        } else {
          // Sem próxima ocorrência: aplica EXDATE como fallback.
          seriesUpdates.recurrenceRule = addExdateToRecurrence(
            task.recurrenceRule,
            task.dueDate,
            task.dueTime,
            occurrenceDate,
          );
        }

        const session = await ensureFreshSession();
        if (!session) return;

        if (!seriesUpdates.dueDate || !seriesUpdates.recurrenceRule) {
          throw new Error('Falha ao calcular próxima ocorrência da série');
        }

        // Cria a tarefa standalone e avança a série original numa única transação.
        const { data: createdTaskId, error } = await supabase.rpc('reschedule_single_occurrence', {
          p_task_id: taskId,
          p_occurrence_date: occurrenceDate,
          p_new_date: newDueDate ?? occurrenceDate,
          p_new_time: newDueTime ? `${newDueTime}:00` : null,
          p_new_duration: newDuration,
          p_series_due_date: seriesUpdates.dueDate,
          p_series_due_time: seriesUpdates.dueTime ? `${seriesUpdates.dueTime}:00` : null,
          p_series_recurrence_rule: seriesUpdates.recurrenceRule,
        } as any);
        if (error || !createdTaskId) {
          throw error ?? new Error('Falha ao remanejar ocorrência');
        }

        await fetchData();

        useUndoStore.getState().push({
          label: `Remanejar "${task.title}"`,
          undo: async () => {
            await useTaskStore.getState().deleteTask(createdTaskId, { skipUndo: true });
            await updateTask(taskId, {
              dueDate: task.dueDate,
              dueTime: task.dueTime ?? null,
              recurrenceRule: task.recurrenceRule,
            });
          },
        });
      } catch (e) {
        console.error('single-occurrence edit failed', e);
        toast.error('Falha ao editar apenas esta ocorrência', {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    },
    [tasks, updateTask, fetchData, ask]
  );
}
