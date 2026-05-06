import { useCallback } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { nextOccurrence } from '@/lib/recurrence';
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
      payload: RecurringCompletionPayload,
      options: { onConflict: string }
    ) => Promise<{ error: unknown }>;
  };
};

/**
 * Centralized completion logic. If task has a recurrence_rule, advances to the
 * next occurrence and logs to activity_log instead of marking completed.
 */
export function useCompleteTask() {
  const tasks = useTaskStore((s) => s.tasks);
  const updateTask = useTaskStore((s) => s.updateTask);
  const toggleTask = useTaskStore((s) => s.toggleTask);

  return useCallback(
    async (taskId: string, options?: { endRecurring?: boolean }) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      // If already completed → just toggle (uncomplete)
      if (task.completed) {
        await toggleTask(taskId);
        return;
      }

      // If recurring → advance, unless caller asked to end the series
      if (task.recurrenceRule && !options?.endRecurring) {
        const next = nextOccurrence(task.recurrenceRule, task.dueDate, task.dueTime);
        if (next) {
          const nextSlotAlreadyExists = tasks.some(
            (candidate) =>
              candidate.id !== taskId &&
              !candidate.completed &&
              candidate.dueDate === next.dueDate &&
              normalizeTitleForDaySlot(candidate.title) === normalizeTitleForDaySlot(task.title) &&
              (candidate.dueTime || null) === (next.dueTime || null)
          );
          const { data: u } = await supabase.auth.getUser();
          if (u.user && task.dueDate) {
            await recurringCompletions.from('recurring_task_completions').upsert({
              task_id: taskId,
              user_id: u.user.id,
              occurrence_date: task.dueDate,
              occurrence_time: task.dueTime || null,
              duration_minutes: task.durationMinutes ?? null,
              title: task.title,
              completed_at: new Date().toISOString(),
            }, { onConflict: 'task_id,user_id,occurrence_date' });
          }

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
          // Log occurrence completion
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
                },
              });
            }
          } catch {
            // ignore log errors
          }
          toast.success('Concluída', {
            description: `Próxima: ${format(parseISO(next.dueDate), "d 'de' MMM", { locale: ptBR })}${next.dueTime ? ` às ${next.dueTime}` : ''}`,
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
