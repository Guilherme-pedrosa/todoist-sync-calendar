import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useChatStore } from '@/store/chatStore';
import { ChatThread } from '@/components/ChatThread';
import { EmbedAuthForm } from '@/components/EmbedAuthForm';

export default function EmbedChat() {
  const { user, loading: authLoading } = useAuth();
  const [params] = useSearchParams();
  const contextId = params.get('contextId') || params.get('context') || '';
  const title = params.get('title') || undefined;

  const ensureContextConversation = useChatStore((s) => s.ensureContextConversation);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !contextId) return;
    let active = true;
    setLoading(true);
    setError(null);
    ensureContextConversation(contextId, title)
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
  }, [user, contextId, title, ensureContextConversation]);

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
            A URL do chat precisa do parâmetro <code className="font-mono">?contextId=…</code> para identificar a conversa.
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

  return (
    <div className="h-screen bg-background flex flex-col">
      {title && (
        <div className="px-4 py-2 border-b bg-card/40">
          <h1 className="font-display text-sm font-semibold truncate">{title}</h1>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <ChatThread conversationId={conversationId} compact />
      </div>
    </div>
  );
}
