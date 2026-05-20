import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Paperclip,
  Send,
  Trash2,
  Download,
  FileText,
  Image as ImageIcon,
  Megaphone,
  Search,
  UserCircle2,
  X,
} from 'lucide-react';
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
  project_name?: string;
  author?: { display_name: string | null; email: string | null; avatar_url: string | null };
};

function sanitize(name: string) {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120);
}

async function attachAuthors(rows: any[]): Promise<Announcement[]> {
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  let profiles: Record<string, any> = {};
  if (userIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('user_id, display_name, email, avatar_url')
      .in('user_id', userIds);
    (profs ?? []).forEach((p: any) => (profiles[p.user_id] = p));
  }
  return rows.map((r) => ({
    ...r,
    attachments: Array.isArray(r.attachments) ? r.attachments : [],
    author: profiles[r.user_id],
  }));
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
  const [search, setSearch] = useState('');
  const [authorViewId, setAuthorViewId] = useState<string | null>(null);

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
    setItems(await attachAuthors((data ?? []) as any[]));
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((a) => {
      const name = userDisplayName(a.author?.display_name, a.author?.email).toLowerCase();
      const text = (a.content || '').toLowerCase();
      const att = a.attachments.map((x) => x.name.toLowerCase()).join(' ');
      return text.includes(q) || name.includes(q) || att.includes(q);
    });
  }, [items, search]);

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

  return (
    <>
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

          {/* Search */}
          <div className="px-4 py-2 border-b bg-background">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar avisos por texto, autor ou anexo..."
                className="pl-8 h-8 text-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading && <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>}
            {!loading && filtered.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Megaphone className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">
                  {search ? 'Nenhum aviso encontrado.' : 'Nenhum aviso ainda. Seja o primeiro a publicar!'}
                </p>
              </div>
            )}
            {filtered.map((a) => (
              <AnnouncementCard
                key={a.id}
                a={a}
                isMine={me === a.user_id}
                onDelete={() => handleDelete(a)}
                onAuthorClick={() => setAuthorViewId(a.user_id)}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {authorViewId && (
        <AuthorAnnouncementsDialog
          open={!!authorViewId}
          onOpenChange={(v) => !v && setAuthorViewId(null)}
          userId={authorViewId}
        />
      )}
    </>
  );
}

function AnnouncementCard({
  a,
  isMine,
  onDelete,
  onAuthorClick,
  showProject,
}: {
  a: Announcement;
  isMine: boolean;
  onDelete: () => void;
  onAuthorClick?: () => void;
  showProject?: boolean;
}) {
  const name = userDisplayName(a.author?.display_name, a.author?.email);
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="flex items-start justify-between gap-2 mb-2">
        <button
          onClick={onAuthorClick}
          className="flex items-center gap-2 group text-left"
          disabled={!onAuthorClick}
        >
          {a.author?.avatar_url ? (
            <img
              src={a.author.avatar_url}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-medium leading-tight group-hover:underline">{name}</p>
            <p className="text-xs text-muted-foreground">
              {showProject && a.project_name ? `${a.project_name} · ` : ''}
              {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
            </p>
          </div>
        </button>
        {isMine && (
          <button
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive p-1"
            aria-label="Excluir"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {a.content && <p className="text-sm whitespace-pre-wrap mb-2">{a.content}</p>}
      {a.attachments.length > 0 && (
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
          {a.attachments.map((att, i) => (
            <AttachmentTile key={i} att={att} />
          ))}
        </div>
      )}
    </div>
  );
}

function AttachmentTile({ att }: { att: Attachment }) {
  const isImg = (att.mime || '').startsWith('image/');
  const open = async () => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(att.path, 3600);
    if (error || !data) {
      toast.error('Erro ao abrir arquivo');
      return;
    }
    window.open(data.signedUrl, '_blank');
  };
  return (
    <button
      onClick={open}
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

/**
 * Dialog que mostra TODOS os avisos de um usuário específico
 * (apenas os de projetos que o visualizador tem acesso, garantido por RLS).
 */
export function AuthorAnnouncementsDialog({
  open,
  onOpenChange,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
}) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [me, setMe] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ display_name: string | null; email: string | null; avatar_url: string | null } | null>(null);

  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    setLoading(true);
    (async () => {
      const [{ data: prof }, { data: rows, error }] = await Promise.all([
        supabase
          .from('profiles')
          .select('display_name, email, avatar_url')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('project_announcements')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);
      setProfile(prof as any);
      if (error) {
        toast.error('Erro ao carregar avisos do usuário');
        setLoading(false);
        return;
      }
      const list = (rows ?? []) as any[];
      const projIds = Array.from(new Set(list.map((r) => r.project_id)));
      let projMap: Record<string, string> = {};
      if (projIds.length) {
        const { data: projs } = await supabase
          .from('projects')
          .select('id, name')
          .in('id', projIds);
        (projs ?? []).forEach((p: any) => (projMap[p.id] = p.name));
      }
      const withAuthor = await attachAuthors(list);
      setItems(withAuthor.map((r) => ({ ...r, project_name: projMap[r.project_id] })));
      setLoading(false);
    })();
  }, [open, userId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (a) =>
        (a.content || '').toLowerCase().includes(q) ||
        (a.project_name || '').toLowerCase().includes(q) ||
        a.attachments.some((x) => x.name.toLowerCase().includes(q)),
    );
  }, [items, search]);

  const name = userDisplayName(profile?.display_name, profile?.email);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-3">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold text-primary">
                {name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="text-left">
              <div className="text-base font-semibold leading-tight">{name}</div>
              <div className="text-xs font-normal text-muted-foreground">
                {items.length} aviso(s) publicado(s)
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nos avisos deste usuário..."
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <UserCircle2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum aviso encontrado.</p>
            </div>
          )}
          {filtered.map((a) => (
            <AnnouncementCard
              key={a.id}
              a={a}
              isMine={me === a.user_id}
              showProject
              onDelete={async () => {
                if (!confirm('Excluir este aviso?')) return;
                const { error } = await supabase.from('project_announcements').delete().eq('id', a.id);
                if (error) {
                  toast.error('Erro ao excluir');
                  return;
                }
                if (a.attachments.length) {
                  await supabase.storage.from(BUCKET).remove(a.attachments.map((x) => x.path));
                }
                setItems((cur) => cur.filter((x) => x.id !== a.id));
                toast.success('Aviso excluído');
              }}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
