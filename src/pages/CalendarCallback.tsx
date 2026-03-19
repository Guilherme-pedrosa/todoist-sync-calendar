import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function CalendarCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const error = searchParams.get('error');
      const code = searchParams.get('code');

      if (error) {
        toast.error('Autorização do Google Calendar cancelada');
        navigate('/', { replace: true });
        return;
      }

      if (!code) {
        toast.error('Código de autorização não encontrado');
        navigate('/', { replace: true });
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
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Erro ao conectar Google Calendar');
        navigate('/', { replace: true });
      }
    };

    void run();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">Conectando Google Calendar...</p>
      </div>
    </div>
  );
}
