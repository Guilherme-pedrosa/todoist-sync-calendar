import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Você cancelou a autorização do Google Calendar.',
  admin_policy_enforced:
    'Sua organização bloqueou o acesso ao Google Calendar. Fale com o administrador do workspace.',
  invalid_scope: 'Os escopos solicitados não foram aprovados pelo Google.',
  unauthorized_client: 'O app ainda não foi autorizado no Google Cloud Console.',
};

export default function CalendarCallback() {
  const navigate = useNavigate();
  const [errorState, setErrorState] = useState<{ title: string; description?: string } | null>(null);
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const run = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description') || undefined;
      const code = searchParams.get('code');

      if (error) {
        const friendly = ERROR_MESSAGES[error] || `Erro do Google: ${error}`;
        toast.error(friendly);
        setErrorState({ title: friendly, description: errorDescription });
        setProcessing(false);
        return;
      }

      if (!code) {
        const msg = 'Código de autorização não encontrado na resposta do Google.';
        toast.error(msg);
        setErrorState({ title: msg });
        setProcessing(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Sessão inválida. Faça login novamente.');
        navigate('/auth', { replace: true });
        return;
      }

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar?action=exchange-code`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              code,
              redirectUri: `${window.location.origin}/calendar-callback`,
            }),
          }
        );

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || 'Falha ao conectar Google Calendar');
        }

        toast.success('Google Calendar conectado com sucesso!');
        navigate('/', { replace: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao conectar Google Calendar';
        toast.error(msg);
        setErrorState({ title: msg });
        setProcessing(false);
      }
    };

    void run();
  }, [navigate]);

  if (errorState) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="font-display text-xl font-semibold">{errorState.title}</h1>
          {errorState.description && (
            <p className="text-sm text-muted-foreground break-words">{errorState.description}</p>
          )}
          <div className="flex gap-2 justify-center pt-2">
            <Button variant="outline" onClick={() => navigate('/', { replace: true })}>
              Voltar
            </Button>
            <Button onClick={() => navigate('/', { replace: true, state: { reconnect: true } })}>
              Tentar novamente
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">
          {processing ? 'Conectando Google Calendar...' : 'Processando...'}
        </p>
      </div>
    </div>
  );
}
