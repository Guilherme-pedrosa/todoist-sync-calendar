import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Paperclip, Send, Trash2, Download, FileText, Image as ImageIcon, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { userDisplayName } from '@/lib/userDisplay';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const BUCKET = 'project-announcements';
const MAX_BYTES = 25 * 1024 * 1024;

type Attachment = {
  name: string;
  path: string;
  mime: string | null;
  size: number;
};

type Announcement = {
  id: string;
  project_id: string;
  user_id: string;
  content: string;
  attachments: Attachment[];
  created_at: string;
  author?: { display_name: string | null; email: string | null; avatar_url: string | null };
};

function sanitize(name: string) {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120);
}

export function ProjectAnnouncementsDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  projectName: string;
}) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [me, setMe] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('project_announcements')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Erro ao carregar avisos');
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as any[];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    let profiles: Record<string, any> = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, email, avatar_url')
        .in('user_id', userIds);
      (profs ?? []).forEach((p: any) => (profiles[p.user_id] = p));
    }
    setItems(
      rows.map((r) => ({
        ...r,
        attachments: Array.isArray(r.attachments) ? r.attachments : [],
        author: profiles[r.user_id],
      })),
    );
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    load();
    const ch = supabase
      .channel(`pa-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_announcements', filter: `project_id=eq.${projectId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [open, projectId, load]);

  const handlePost = async () => {
    if (!content.trim() && files.length === 0) {
      toast.error('Escreva uma mensagem ou anexe um arquivo');
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      toast.error('Sessão expirada');
      return;
    }
    setPosting(true);
    try {
      const uploaded: Attachment[] = [];
      for (const f of files) {
        if (f.size > MAX_BYTES) {
          toast.error(`${f.name} maior que 25MB`);
          continue;
        }
        const path = `${projectId}/${crypto.randomUUID()}-${sanitize(f.name)}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, f, { contentType: f.type || undefined, upsert: false });
        if (upErr) {
          toast.error(`Falha ao enviar ${f.name}`);
          continue;
        }
        uploaded.push({ name: f.name, path, mime: f.type || null, size: f.size });
      }
      const { error } = await supabase.from('project_announcements').insert({
        project_id: projectId,
        user_id: userId,
        content: content.trim(),
        attachments: uploaded as any,
      });
      if (error) throw error;
      setContent('');
      setFiles([]);
      toast.success('Aviso publicado');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao publicar');
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (a: Announcement) => {
    if (!confirm('Excluir este aviso?')) return;
    const { error } = await supabase.from('project_announcements').delete().eq('id', a.id);
    if (error) {
      toast.error('Erro ao excluir');
      return;
    }
    if (a.attachments.length) {
      await supabase.storage.from(BUCKET).remove(a.attachments.map((x) => x.path));
    }
    toast.success('Aviso excluído');
  };

  const openFile = async (att: Attachment) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(att.path, 3600);
    if (error || !data) {
      toast.error('Erro ao abrir arquivo');
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Avisos — {projectName}
          </DialogTitle>
        </DialogHeader>

        {/* Composer */}
        <div className="p-4 border-b bg-muted/30 space-y-2">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escreva um aviso para o projeto..."
            className="min-h-[70px] resize-none bg-background"
          />
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div key={i} className="text-xs bg-background border rounded px-2 py-1 flex items-center gap-2">
                  <span className="truncate max-w-[160px]">{f.name}</span>
                  <button
                    onClick={() => setFiles((arr) => arr.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
              <Paperclip className="h-4 w-4" />
              Anexar arquivos
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  setFiles((cur) => [...cur, ...list]);
                  e.target.value = '';
                }}
              />
            </label>
            <Button size="sm" onClick={handlePost} disabled={posting} className="gap-1.5">
              <Send className="h-3.5 w-3.5" />
              {posting ? 'Publicando...' : 'Publicar'}
            </Button>
          </div>
        </div>

        {/* Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>}
          {!loading && items.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <Megaphone className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum aviso ainda. Seja o primeiro a publicar!</p>
            </div>
          )}
          {items.map((a) => {
            const name = userDisplayName(a.author?.display_name, a.author?.email);
            const isMine = me === a.user_id;
            return (
              <div key={a.id} className="border rounded-lg p-3 bg-card">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                      {name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-tight">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  {isMine && (
                    <button
                      onClick={() => handleDelete(a)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {a.content && (
                  <p className="text-sm whitespace-pre-wrap mb-2">{a.content}</p>
                )}
                {a.attachments.length > 0 && (
                  <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
                    {a.attachments.map((att, i) => {
                      const isImg = (att.mime || '').startsWith('image/');
                      return (
                        <button
                          key={i}
                          onClick={() => openFile(att)}
                          className="border rounded-md p-2 text-left hover:bg-muted/50 flex flex-col gap-1 text-xs"
                        >
                          <div className="flex items-center gap-1.5">
                            {isImg ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                            <span className="truncate flex-1">{att.name}</span>
                            <Download className="h-3 w-3 text-muted-foreground" />
                          </div>
                          {isImg && <ImagePreview path={att.path} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImagePreview({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (active && data) setUrl(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [path]);
  if (!url) return <div className="h-20 bg-muted rounded animate-pulse" />;
  return <img src={url} alt="" className="h-20 w-full object-cover rounded" loading="lazy" />;
}
