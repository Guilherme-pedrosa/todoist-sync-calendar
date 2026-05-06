-- Fix: log_task_changes referencia OLD.* e quebra em INSERT.
DROP TRIGGER IF EXISTS trg_log_task_changes ON public.tasks;
CREATE TRIGGER trg_log_task_changes
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_changes();

-- Remove triggers duplicados
DROP TRIGGER IF EXISTS trg_10_assign_task_number ON public.tasks;
DROP TRIGGER IF EXISTS log_task_completion_trigger ON public.tasks;

-- Garante log de criação (substitui o que log_task_changes fazia em INSERT)
DROP TRIGGER IF EXISTS trg_log_task_created ON public.tasks;
CREATE TRIGGER trg_log_task_created
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_created();