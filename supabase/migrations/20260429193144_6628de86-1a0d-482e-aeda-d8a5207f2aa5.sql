-- 1. Add column
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS task_number integer;

-- 2. Backfill: number existing tasks per workspace, ordered by created_at
WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.tasks
  WHERE task_number IS NULL
)
UPDATE public.tasks t
SET task_number = numbered.rn
FROM numbered
WHERE t.id = numbered.id;

-- 3. Unique index per workspace
CREATE UNIQUE INDEX IF NOT EXISTS tasks_workspace_number_uidx
  ON public.tasks(workspace_id, task_number)
  WHERE task_number IS NOT NULL;

-- 4. Trigger function to assign next number
CREATE OR REPLACE FUNCTION public.assign_task_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  IF NEW.task_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Lock the workspace row to avoid races
  PERFORM 1 FROM public.workspaces WHERE id = NEW.workspace_id FOR UPDATE;

  SELECT COALESCE(MAX(task_number), 0) + 1
    INTO next_num
    FROM public.tasks
    WHERE workspace_id = NEW.workspace_id;

  NEW.task_number := next_num;
  RETURN NEW;
END;
$$;

-- 5. Trigger
DROP TRIGGER IF EXISTS trg_assign_task_number ON public.tasks;
CREATE TRIGGER trg_assign_task_number
  BEFORE INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_task_number();