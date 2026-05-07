
-- Trigger: limpar reminders não disparados quando a tarefa é reagendada/concluída/deletada
CREATE OR REPLACE FUNCTION public.cleanup_reminders_on_task_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.due_at IS DISTINCT FROM OLD.due_at)
     OR (NEW.completed_at IS DISTINCT FROM OLD.completed_at AND NEW.completed_at IS NOT NULL)
     OR (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND NEW.deleted_at IS NOT NULL)
  THEN
    DELETE FROM public.reminders
    WHERE task_id = NEW.id
      AND fired_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_reminders_on_task_change ON public.tasks;
CREATE TRIGGER trg_cleanup_reminders_on_task_change
AFTER UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_reminders_on_task_change();

-- Limpeza pontual: remove reminders não disparados de tarefas cuja due_at não bate mais
DELETE FROM public.reminders r
USING public.tasks t
WHERE r.task_id = t.id
  AND r.fired_at IS NULL
  AND (
    t.completed_at IS NOT NULL
    OR t.deleted_at IS NOT NULL
    OR t.due_at IS NULL
    OR (r.type = 'absolute' AND r.relative_minutes IS NOT NULL
        AND r.trigger_at <> (t.due_at - make_interval(mins => r.relative_minutes)))
  );
