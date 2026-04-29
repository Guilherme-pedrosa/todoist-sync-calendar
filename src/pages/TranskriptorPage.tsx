import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Download, KeyRound, RefreshCw, ExternalLink, Search, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ExportType = 'txt' | 'pdf' | 'srt' | 'docx';

interface TranskriptorFile {
  order_id?: string;
  id?: string;
  file_id?: string;
  file_name?: string;
  name?: string;
  title?: string;
  duration?: number;
  minutes?: number;
  language?: string;
  status?: string;
  created_at?: string | number;
  createdAt?: string | number;
  service?: string;
}

const EXPORT_LABELS: Record<ExportType, string> = {
  txt: 'TXT',
  pdf: 'PDF',
  srt: 'SRT',
  docx: 'DOCX',
};

const MIME_BY_EXT: Record<ExportType, string> = {
  txt: 'text/plain',
  pdf: 'application/pdf',
  srt: 'application/x-subrip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function authedFetch(path: string, init: RequestInit = {}) {
  return supabase.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token;
    if (!token) throw new Error('Sessão inválida. Faça login novamente.');
    return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transkriptor-proxy${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
    });
  });
}

function base64ToBlob(b64: string, mime: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export default function TranskriptorPage() {
  const { user } = useAuth();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [files, setFiles] = useState<TranskriptorFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const checkKey = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('transkriptor_keys')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    setHasKey(!!data);
  };

  useEffect(() => {
    void checkKey();
  }, [user]);

  const saveKey = async () => {
    if (!user || !apiKeyInput.trim()) return;
    setSavingKey(true);
    try {
      const { error } = await supabase
        .from('transkriptor_keys')
        .upsert({ user_id: user.id, api_key: apiKeyInput.trim() }, { onConflict: 'user_id' });
      if (error) throw error;
      toast.success('Chave do Transkriptor salva');
      setKeyDialogOpen(false);
      setApiKeyInput('');
      setHasKey(true);
      void loadFiles();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar');
    } finally {
      setSavingKey(false);
    }
  };

  const loadFiles = async () => {
    setLoading(true);
    try {
      const r = await authedFetch('?action=list');
      const data = await r.json();
      if (!r.ok) {
        if (data?.error === 'no_api_key') {
          setHasKey(false);
          setKeyDialogOpen(true);
          return;
        }
        throw new Error(data?.error || 'Falha ao listar reuniões');
      }
      // API can return array directly or { files: [...] }
      const list: TranskriptorFile[] = Array.isArray(data)
        ? data
        : data?.files ?? data?.data ?? data?.results ?? [];
      setFiles(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasKey) void loadFiles();
  }, [hasKey]);

  const downloadFile = async (file: TranskriptorFile, type: ExportType) => {
    const orderId = file.order_id || file.id;
    if (!orderId) {
      toast.error('Reunião sem identificador');
      return;
    }
    setDownloadingId(`${orderId}-${type}`);
    try {
      const r = await authedFetch('?action=export', {
        method: 'POST',
        body: JSON.stringify({
          order_id: orderId,
          export_type: type,
          include_speaker_names: true,
          include_timestamps: type === 'srt',
        }),
      });
      const data = await r.json();
      if (!r.ok || !data?.base64) {
        throw new Error(data?.error || 'Falha ao exportar');
      }
      const blob = base64ToBlob(data.base64, MIME_BY_EXT[type]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = (file.file_name || file.name || file.title || `reuniao-${orderId}`)
        .replace(/\.[^.]+$/, '');
      a.download = `${baseName}.${type}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Baixado em ${EXPORT_LABELS[type]}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro no download');
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadAll = async (type: ExportType) => {
    for (const f of filtered) {
      await downloadFile(f, type);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) =>
      [f.file_name, f.name, f.title, f.language, f.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [files, search]);

  const formatDuration = (file: TranskriptorFile) => {
    if (typeof file.minutes === 'number' && file.minutes > 0) {
      return `${file.minutes} min`;
    }
    if (file.duration && file.duration > 0) {
      const m = Math.floor(file.duration / 60);
      const sec = Math.round(file.duration % 60);
      return `${m}m ${sec}s`;
    }
    return '—';
  };

  const formatDate = (raw?: string | number) => {
    if (raw === undefined || raw === null || raw === '') return '—';
    // Transkriptor returns ms epoch as string; also accept ISO strings
    let d: Date;
    const asNum = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(asNum) && asNum > 1_000_000_000) {
      // seconds vs milliseconds heuristic
      d = new Date(asNum < 1e12 ? asNum * 1000 : asNum);
    } else {
      d = new Date(String(raw));
    }
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR');
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <header className="px-6 py-4 border-b border-border flex items-center gap-3">
        <FileText className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h1 className="font-display text-xl font-bold">Transkriptor</h1>
          <p className="text-xs text-muted-foreground">
            Suas reuniões transcritas — baixe em TXT, PDF, SRT ou DOCX
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setKeyDialogOpen(true)}>
          <KeyRound className="h-4 w-4 mr-2" />
          {hasKey ? 'Atualizar chave' : 'Conectar'}
        </Button>
        <Button variant="outline" size="sm" onClick={loadFiles} disabled={loading || !hasKey}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {hasKey === false && (
          <div className="max-w-xl mx-auto text-center py-12 space-y-4">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-semibold">Conecte sua conta Transkriptor</h2>
            <p className="text-sm text-muted-foreground">
              Cole sua chave de API do Transkriptor para listar e baixar todas as suas reuniões.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button onClick={() => setKeyDialogOpen(true)}>
                <KeyRound className="h-4 w-4 mr-2" />Adicionar chave
              </Button>
              <a
                href="https://app.transkriptor.com/account"
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
              >
                Onde encontrar a chave <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}

        {hasKey && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1 max-w-md">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar reuniões..."
                  className="pl-9"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={loading || filtered.length === 0}>
                    <Download className="h-4 w-4 mr-2" />Baixar todas
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(Object.keys(EXPORT_LABELS) as ExportType[]).map((t) => (
                    <DropdownMenuItem key={t} onSelect={() => downloadAll(t)}>
                      Como {EXPORT_LABELS[t]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Nenhuma reunião encontrada.
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold">Reunião</th>
                      <th className="text-left px-4 py-2 font-semibold hidden md:table-cell">Data</th>
                      <th className="text-left px-4 py-2 font-semibold hidden md:table-cell">Duração</th>
                      <th className="text-left px-4 py-2 font-semibold hidden lg:table-cell">Idioma</th>
                      <th className="text-right px-4 py-2 font-semibold">Baixar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((f) => {
                      const orderId = f.order_id || f.id || '';
                      const name = f.file_name || f.name || f.title || 'Sem título';
                      return (
                        <tr key={orderId} className="border-t border-border hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <div className="font-medium truncate max-w-[420px]">{name}</div>
                            {f.status && (
                              <div className="text-xs text-muted-foreground">{f.status}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                            {formatDate(f.created_at ?? f.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden md:table-cell tabular-nums">
                            {formatDuration(f)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell uppercase">
                            {f.language || '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="outline" disabled={!!downloadingId}>
                                  {downloadingId?.startsWith(orderId) ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Download className="h-4 w-4" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {(Object.keys(EXPORT_LABELS) as ExportType[]).map((t) => (
                                  <DropdownMenuItem key={t} onSelect={() => downloadFile(f, t)}>
                                    {EXPORT_LABELS[t]}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chave de API do Transkriptor</DialogTitle>
            <DialogDescription>
              Cole sua chave pessoal. Ela fica salva apenas na sua conta e não é compartilhada.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="sua_api_key_aqui"
            type="password"
            autoFocus
          />
          <a
            href="https://app.transkriptor.com/account"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary inline-flex items-center gap-1 hover:underline w-fit"
          >
            Onde encontrar minha chave <ExternalLink className="h-3 w-3" />
          </a>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setKeyDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveKey} disabled={!apiKeyInput.trim() || savingKey}>
              {savingKey && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
