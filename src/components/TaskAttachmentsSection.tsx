import { useEffect, useRef, useState } from 'react';
import { Paperclip, Trash2, Download, Loader2, FileText, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  TaskAttachment,
  deleteTaskAttachment,
  getAttachmentUrl,
  getAttachmentDownloadUrl,
  listTaskAttachments,
  uploadTaskAttachment,
} from '@/lib/attachments';
import { cn } from '@/lib/utils';
import { triggerBrowserDownload } from '@/lib/downloadFile';

function formatBytes(n?: number | null) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function TaskAttachmentsSection({ taskId, compact = false }: { taskId: string; compact?: boolean }) {
  const [items, setItems] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listTaskAttachments(taskId)
      .then((rows) => { if (!cancelled) setItems(rows); })
      .catch((e) => console.error('[attachments] list', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        try {
          const created = await uploadTaskAttachment(taskId, file);
          setItems((prev) => [created, ...prev]);
        } catch (e) {
          toast.error(`Falha ao enviar ${file.name}: ${e instanceof Error ? e.message : ''}`);
        }
      }
      toast.success('Anexo enviado');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const open = async (att: TaskAttachment) => {
    try {
      const url = await getAttachmentUrl(att.storage_path);
      triggerBrowserDownload(url, att.name);
    } catch (e) {
      toast.error('Não foi possível abrir o anexo');
    }
  };

  const download = async (att: TaskAttachment) => {
    try {
      const url = await getAttachmentDownloadUrl(att.storage_path, att.name);
      triggerBrowserDownload(url, att.name);
    } catch (e) {
      toast.error('Nao foi possivel baixar o anexo');
    }
  };

  const remove = async (att: TaskAttachment) => {
    if (!confirm(`Remover ${att.name}?`)) return;
    try {
      await deleteTaskAttachment(att);
      setItems((prev) => prev.filter((x) => x.id !== att.id));
    } catch (e) {
      toast.error('Falha ao remover anexo');
    }
  };

  return (
    <div className={cn('space-y-2', compact && 'text-xs')}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Anexos {items.length > 0 && <span className="text-muted-foreground/60">({items.length})</span>}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex min-h-9 sm:min-h-0 items-center gap-1.5 text-xs px-2 py-1 rounded border border-border hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          Adicionar
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">Carregando…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted-foreground/70">Nenhum anexo ainda.</div>
      ) : (
        <ul className="space-y-1">
          {items.map((att) => {
            const isImg = (att.mime_type || '').startsWith('image/');
            return (
              <li
                key={att.id}
                className="group flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-2 sm:py-1.5"
              >
                {isImg ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                <button
                  type="button"
                  onClick={() => download(att)}
                  className="flex-1 min-w-0 text-left text-xs truncate hover:text-primary"
                  title={att.name}
                >
                  {att.name}
                </button>
                <span className="text-[10px] text-muted-foreground shrink-0">{formatBytes(att.size)}</span>
                <button
                  type="button"
                  onClick={() => download(att)}
                  className="h-10 w-10 sm:h-7 sm:w-7 inline-flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-primary"
                  title="Baixar"
                  aria-label={`Baixar ${att.name}`}
                >
                  <Download className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(att)}
                  className="h-10 w-10 sm:h-7 sm:w-7 inline-flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  title="Remover"
                  aria-label={`Remover ${att.name}`}
                >
                  <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
