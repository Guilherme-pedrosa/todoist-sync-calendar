import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Download, RefreshCw, Search, Mic, Copy, Trash2, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface PlaudMeeting {
  id: string;
  title: string;
  meeting_date: string | null;
  duration_minutes: number | null;
  language: string | null;
  summary: string | null;
  transcript: string | null;
  audio_url: string | null;
  created_at: string;
}

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plaud-webhook`;

export default function PlaudPage() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<PlaudMeeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('plaud_meetings')
        .select('id, title, meeting_date, duration_minutes, language, summary, transcript, audio_url, created_at')
        .order('meeting_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      setMeetings((data ?? []) as PlaudMeeting[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar reuniões');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return meetings;
    return meetings.filter((m) =>
      [m.title, m.summary, m.transcript, m.language]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [meetings, search]);

  const downloadTxt = (m: PlaudMeeting) => {
    const content = [
      m.title,
      m.meeting_date ? new Date(m.meeting_date).toLocaleString('pt-BR') : '',
      '',
      m.summary ? `RESUMO:\n${m.summary}\n` : '',
      m.transcript ? `TRANSCRIÇÃO:\n${m.transcript}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${m.title.replace(/[\\/:*?"<>|]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('plaud_meetings').delete().eq('id', id);
    if (error) {
      toast.error('Não foi possível excluir');
      return;
    }
    setMeetings((prev) => prev.filter((m) => m.id !== id));
    toast.success('Reunião removida');
  };

  const formatDate = (raw: string | null) =>
    raw ? new Date(raw).toLocaleString('pt-BR') : '—';

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <header className="px-6 py-4 border-b border-border flex items-center gap-3">
        <Mic className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h1 className="font-display text-xl font-bold">Plaud</h1>
          <p className="text-xs text-muted-foreground">
            Reuniões recebidas do Plaud via Zapier — resumo, transcrição e download
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
          Conectar Zapier
        </Button>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="relative max-w-md mb-4">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, resumo ou transcrição..."
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <Mic className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhuma reunião ainda. Configure o Zap para enviar suas gravações do Plaud para cá.
            </p>
            <Button size="sm" onClick={() => setHelpOpen(true)}>
              Ver instruções do Zapier
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((m) => (
              <div key={m.id} className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-start gap-3 px-4 py-3">
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                  >
                    <div className="font-medium truncate">{m.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(m.meeting_date)}
                      {m.duration_minutes ? ` • ${Math.round(m.duration_minutes)} min` : ''}
                      {m.language ? ` • ${m.language.toUpperCase()}` : ''}
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => downloadTxt(m)} title="Baixar TXT">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(m.id)} title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${expanded === m.id ? 'rotate-180' : ''}`}
                      />
                    </Button>
                  </div>
                </div>
                {expanded === m.id && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    {m.audio_url && (
                      <audio controls src={m.audio_url} className="w-full" />
                    )}
                    {m.summary && (
                      <div>
                        <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                          Resumo
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{m.summary}</p>
                      </div>
                    )}
                    {m.transcript && (
                      <div>
                        <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                          Transcrição
                        </div>
                        <p className="text-sm whitespace-pre-wrap max-h-80 overflow-y-auto">
                          {m.transcript}
                        </p>
                      </div>
                    )}
                    {!m.summary && !m.transcript && (
                      <p className="text-sm text-muted-foreground">Sem conteúdo textual.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Conectar o Plaud pelo Zapier</DialogTitle>
            <DialogDescription>
              O Plaud não tem API pública, então o Zapier envia as reuniões para o app.
            </DialogDescription>
          </DialogHeader>
          <ol className="text-sm space-y-2 list-decimal pl-4">
            <li>Em Configurações → Chaves de API, gere uma chave e copie.</li>
            <li>No Zapier, crie um Zap com o gatilho do Plaud (ou e-mail/Drive onde as gravações chegam).</li>
            <li>
              Adicione a ação <strong>Webhooks by Zapier → POST</strong> com esta URL:
            </li>
          </ol>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted px-2 py-2 rounded break-all">{WEBHOOK_URL}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(WEBHOOK_URL);
                toast.success('URL copiada');
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-sm space-y-1">
            <p className="font-medium">Headers</p>
            <code className="block text-xs bg-muted px-2 py-2 rounded">
              x-api-key: SUA_CHAVE
            </code>
            <p className="font-medium mt-2">Campos do Data (todos opcionais menos title)</p>
            <code className="block text-xs bg-muted px-2 py-2 rounded whitespace-pre">
{`title, external_id, meeting_date,
duration_minutes, language,
summary, transcript, audio_url`}
            </code>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
