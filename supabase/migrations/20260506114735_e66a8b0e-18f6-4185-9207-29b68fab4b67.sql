CREATE POLICY "Users sharing a task can view each other profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE public.has_task_access(t.id, auth.uid())
      AND public.has_task_access(t.id, profiles.user_id)
    LIMIT 1
  )
);