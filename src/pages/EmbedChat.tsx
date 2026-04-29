import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, ExternalLink, FileText, MapPin } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useChatStore } from '@/store/chatStore';
import { ChatThread } from '@/components/ChatThread';
import { EmbedAuthForm } from '@/components/EmbedAuthForm';
import { Button } from '@/components/ui/button';

/**
 * Embed do chat TaskFlow para uso em iframes (ex: Auvo GC Sync).
 *
 * Parâmetros aceitos:
 *  - contextId  (obrigatório) → chave única da conversa. Se não vier, é gerado a partir de osId+page.
 *  - osId       → ID da Ordem de Serviço no Auvo (compõe contextId quando não informado).
 *  - osNumber   → Número/código amigável da OS (exibido no header).
 *  - title      → Título customizado (sobrescreve montagem padrão).
 *  - page       → Identificador da página onde o chat foi aberto (ex: "kanban-os", "agenda").
 *  - auvoLink   → URL pra abrir a OS no Auvo.
 *  - gcLink     → URL pra abrir a OS no GestãoClick.
 *  - sourceUrl  → URL completa da página atual no host (deep link).
 */
export default function EmbedChat() {
  const { user, loading: authLoading } = useAuth();
  const [params] = useSearchParams();

  const osId = params.get('osId') || '';
  const osNumber = params.get('osNumber') || '';
  const page = params.get('page') || '';
  const auvoLink = params.get('auvoLink') || '';
  const gcLink = params.get('gcLink') || '';
  const sourceUrl = params.get('sourceUrl') || '';
  const titleParam = params.get('title') || '';

  // Monta um contextId composto se não veio explícito.
  // Prioridade: contextId param > osId+page > osId > page
  const contextId = useMemo(() => {
    const explicit = params.get('contextId') || params.get('context');
    if (explicit) return explicit;
    if (osId && page) return `os:${osId}@${page}`;
    if (osId) return `os:${osId}`;
    if (page) return `page:${page}`;
    return '';
  }, [params, osId, page]);

  const computedTitle = useMemo(() => {
    if (titleParam) return titleParam;
    const parts: string[] = [];
    if (osNumber) parts.push(`OS ${osNumber}`);
    else if (osId) parts.push(`OS #${osId}`);
    if (page) parts.push(page);
    return parts.join(' · ') || undefined;
  }, [titleParam, osNumber, osId, page]);

  const ensureContextConversation = useChatStore((s) => s.ensureContextConversation);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !contextId) return;
    let active = true;
    setLoading(true);
    setError(null);
    ensureContextConversation(contextId, computedTitle)
      .then((id) => {
        if (!active) return;
        if (id) setConversationId(id);
        else setError('Não foi possível abrir essa conversa.');
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || 'Erro ao abrir conversa.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, contextId, computedTitle, ensureContextConversation]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!contextId) {
    return (
      <div className="flex items-center justify-center h-screen bg-background px-4">
        <div className="text-center max-w-xs space-y-3">
          <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
          <h1 className="font-display text-base font-semibold">Parâmetro faltando</h1>
          <p className="text-xs text-muted-foreground">
            Informe pelo menos <code className="font-mono">?contextId=…</code> ou{' '}
            <code className="font-mono">?osId=…</code> na URL.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <EmbedAuthForm />;
  }

  if (loading || !conversationId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Abrindo conversa…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background px-4">
        <div className="text-center max-w-xs space-y-3">
          <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const hasContextBar = computedTitle || auvoLink || gcLink || sourceUrl;

  return (
    <div className="h-screen bg-background flex flex-col">
      {hasContextBar && (
        <div className="px-3 py-2 border-b bg-card/40 flex items-center gap-2 min-w-0">
          <div className="flex-1 min-w-0">
            {computedTitle && (
              <h1 className="font-display text-sm font-semibold truncate">{computedTitle}</h1>
            )}
            {page && (
              <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" />
                {page}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {auvoLink && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1"
                asChild
                title="Abrir OS no Auvo"
              >
                <a href={auvoLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" />
                  Auvo
                </a>
              </Button>
            )}
            {gcLink && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1"
                asChild
                title="Abrir no GestãoClick"
              >
                <a href={gcLink} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-3 w-3" />
                  GC
                </a>
              </Button>
            )}
            {sourceUrl && !auvoLink && !gcLink && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1"
                asChild
                title="Abrir página de origem"
              >
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" />
                  Abrir
                </a>
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <ChatThread conversationId={conversationId} compact />
      </div>
    </div>
  );
}
