import { supabase } from '@/integrations/supabase/client';

export const ATTACHMENT_BUCKET = 'task-attachments';
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB

export type TaskAttachment = {
  id: string;
  task_id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size: number | null;
  uploaded_by: string;
  created_at: string;
};

function sanitizeName(name: string) {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120);
}

export async function uploadTaskAttachment(taskId: string, file: File): Promise<TaskAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('Arquivo maior que 25MB');
  }
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Sessão expirada');

  const safe = sanitizeName(file.name);
  const path = `${taskId}/${crypto.randomUUID()}-${safe}`;

  const { error: upErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from('task_attachments')
    .insert({
      task_id: taskId,
      name: file.name,
      storage_path: path,
      mime_type: file.type || null,
      size: file.size,
      uploaded_by: userId,
    })
    .select()
    .single();
  if (error) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
    throw error;
  }
  return data as TaskAttachment;
}

export async function listTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  const { data, error } = await supabase
    .from('task_attachments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TaskAttachment[];
}

export async function deleteTaskAttachment(att: TaskAttachment) {
  const { error } = await supabase.from('task_attachments').delete().eq('id', att.id);
  if (error) throw error;
  await supabase.storage.from(ATTACHMENT_BUCKET).remove([att.storage_path]);
}

export async function getAttachmentUrl(storagePath: string, expiresIn = 60 * 60): Promise<string> {
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
