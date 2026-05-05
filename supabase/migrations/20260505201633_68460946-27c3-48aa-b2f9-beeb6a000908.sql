-- Permitir que qualquer pessoa com acesso à tarefa veja/comente
DROP POLICY IF EXISTS view_own_comments ON public.comments;
DROP POLICY IF EXISTS insert_own_comments ON public.comments;
DROP POLICY IF EXISTS update_own_comments ON public.comments;
DROP POLICY IF EXISTS delete_own_comments ON public.comments;

CREATE POLICY comments_select ON public.comments
  FOR SELECT USING (public.has_task_access(task_id, auth.uid()));

CREATE POLICY comments_insert ON public.comments
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.has_task_access(task_id, auth.uid()));

CREATE POLICY comments_update ON public.comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY comments_delete ON public.comments
  FOR DELETE USING (auth.uid() = user_id);