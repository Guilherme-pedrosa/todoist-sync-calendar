import { useCallback } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { nextOccurrence, expandOccurrencesInRange } from '@/lib/recurrence';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const normalizeTitleForDaySlot = (title: string) =>
  title.replace(/^✅\s*/, '').trim().toLocaleLowerCase();

type RecurringCompletionPayload = {
  task_id: string;
  user_id: string;
  occurrence_date: string;
  occurrence_time: string | null;
  duration_minutes: number | null;
  title: string;
  completed_at: string;
};

const recurringCompletions = supabase as unknown as {
  from: (table: 'recurring_task_completions') => {
    upsert: (
      payload: RecurringCompletionPayload | RecurringCompletionPayload[],
      options: { onConflict: string }
    ) => Promise<{ error: unknown }>;
  };
};

const todayKey = () => format(new Date(), 'yyyy-MM-dd');

/**
 * Centralized completion logic. If task has a recurrence_rule, advances to the
 * next occurrence and logs to activity_log instead of marking completed.
 *
 * `occurrenceDate` (yyyy-MM-dd) is the specific occurrence the user clicked
 * (defaults to today). Any missed occurrences between task.dueDate and
 * `occurrenceDate` are ALSO logged as completed — so completing today's
 * "tomar remédio" automatically catches up yesterday's missed dose.
 */
export function useCompleteTask() {
  const tasks = useTaskStore((s) => s.tasks);
  const updateTask = useTaskStore((s) => s.updateTask);
  const toggleTask = useTaskStore((s) => s.toggleTask);

  return useCallback(
    async (
      taskId: string,
      options?: { endRecurring?: boolean; occurrenceDate?: string }
    ) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      // If already completed → just toggle (uncomplete)
      if (task.completed) {
        await toggleTask(taskId);
        return;
      }

      // If recurring → advance, unless caller asked to end the series
      if (task.recurrenceRule && !options?.endRecurring) {
        const target = options?.occurrenceDate || todayKey();
        const anchorDate = task.dueDate || target;

        // Compute all occurrence dates from anchor up to and including target.
        // This backfills any missed days when the user completes today.
        let occurrencesToLog: string[] = [];
        try {
          const start = parseISO(`${anchorDate}T00:00:00`);
          const end = parseISO(`${target}T23:59:59`);
          if (end >= start) {
            occurrencesToLog = expandOccurrencesInRange(
              task.recurrenceRule,
              anchorDate,
              task.dueTime,
              start,
              end
            );
          }
        } catch (e) {
          console.warn('[useCompleteTask] expand missed occurrences failed', e);
        }

        // Ensure target itself is in the list (covers edge cases where the
        // anchor is in the future or expand returns nothing for the target).
        if (anchorDate <= target && !occurrencesToLog.includes(target)) {
          // Only add target if it's the task's own dueDate; otherwise we'd be
          // inventing an occurrence the rule doesn't actually emit.
          if (target === anchorDate) occurrencesToLog.push(target);
        }

        const { data: u } = await supabase.auth.getUser();
        if (u.user && occurrencesToLog.length > 0) {
          const nowIso = new Date().toISOString();
          const payloads: RecurringCompletionPayload[] = occurrencesToLog.map((d) => ({
            task_id: taskId,
            user_id: u.user!.id,
            occurrence_date: d,
            occurrence_time: task.dueTime || null,
            duration_minutes: task.durationMinutes ?? null,
            title: task.title,
            completed_at: nowIso,
          }));
          const { error } = await recurringCompletions
            .from('recurring_task_completions')
            .upsert(payloads, { onConflict: 'task_id,user_id,occurrence_date' });
          if (error) console.warn('[useCompleteTask] upsert recurring completions failed', error);
        }

        // Compute next occurrence AFTER the target date.
        const next = nextOccurrence(task.recurrenceRule, target, task.dueTime);

        if (next) {
          const nextSlotAlreadyExists = tasks.some(
            (candidate) =>
              candidate.id !== taskId &&
              !candidate.completed &&
              candidate.dueDate === next.dueDate &&
              normalizeTitleForDaySlot(candidate.title) === normalizeTitleForDaySlot(task.title) &&
              (candidate.dueTime || null) === (next.dueTime || null)
          );

          if (nextSlotAlreadyExists) {
            await updateTask(taskId, { recurrenceRule: null });
            await toggleTask(taskId);
            toast.success('Concluída', {
              description: 'A próxima ocorrência já existia e foi mantida na Agenda.',
            });
            return;
          }

          await updateTask(taskId, {
            dueDate: next.dueDate,
            dueTime: next.dueTime,
          });

          // Defesa: confirmar que a série realmente avançou.
          const refreshed = useTaskStore.getState().tasks.find((tt) => tt.id === taskId);
          if (refreshed && refreshed.dueDate !== next.dueDate) {
            console.warn('[useCompleteTask] série não avançou após updateTask, tentando novamente', {
              taskId, expected_due: next.dueDate, actual_due: refreshed.dueDate,
            });
            await updateTask(taskId, { dueDate: next.dueDate, dueTime: next.dueTime });
          }

          // Log occurrence completion in activity_log
          try {
            if (u.user) {
              await supabase.from('activity_log').insert({
                user_id: u.user.id,
                entity_type: 'task',
                entity_id: taskId,
                action: 'recurred',
                payload: {
                  title: task.title,
                  previous_due: task.dueDate,
                  next_due: next.dueDate,
                  backfilled_count: occurrencesToLog.length,
                },
              });
            }
          } catch {
            // ignore log errors
          }

          const backfillNote =
            occurrencesToLog.length > 1
              ? ` (${occurrencesToLog.length} ocorrências marcadas)`
              : '';
          toast.success('Concluída', {
            description: `Próxima: ${format(parseISO(next.dueDate), "d 'de' MMM", { locale: ptBR })}${next.dueTime ? ` às ${next.dueTime}` : ''}${backfillNote}`,
          });
          return;
        }
        // If null → recurrence ended, mark as truly done below
      }

      // End-recurring path: clear the rule then mark completed below
      if (task.recurrenceRule && options?.endRecurring) {
        await updateTask(taskId, { recurrenceRule: null });
      }

      await toggleTask(taskId);
      toast(options?.endRecurring ? 'Tarefa finalizada para sempre' : 'Tarefa concluída', {
        duration: 5000,
        action: {
          label: 'Desfazer',
          onClick: () => {
            void toggleTask(taskId);
          },
        },
      });
    },
    [tasks, toggleTask, updateTask]
  );
}
