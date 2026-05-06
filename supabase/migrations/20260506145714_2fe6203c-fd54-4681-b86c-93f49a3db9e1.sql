
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: {task_id}/{uuid}-{filename}
CREATE POLICY "task-attachments select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND public.has_task_access(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "task-attachments insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-attachments'
  AND auth.uid() = owner
  AND public.has_task_access(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "task-attachments delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND auth.uid() = owner
);
