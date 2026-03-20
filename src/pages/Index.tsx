import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useTaskStore } from '@/store/taskStore';
import { AppSidebar } from '@/components/AppSidebar';
import { TaskList } from '@/components/TaskList';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const Index = () => {
  const sidebarOpen = useTaskStore((s) => s.sidebarOpen);
  const loading = useTaskStore((s) => s.loading);
  const fetchData = useTaskStore((s) => s.fetchData);
  const { user, calendarConnected } = useAuth();
  const [processingCalendarOauth, setProcessingCalendarOauth] = useState(false);

  useEffect(() => {
    if (!user) return;

    const searchParams = new URLSearchParams(window.location.search);
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    const code = searchParams.get('code');

    if (!error && !code) return;

    let active = true;
    const clearQuery = () => window.history.replaceState({}, '', window.location.pathname);

    const runExchange = async () => {
      setProcessingCalendarOauth(true);

      if (error) {
        toast.error(errorDescription || 'Autorização do Google Calendar cancelada');
        clearQuery();
        setProcessingCalendarOauth(false);
        return;
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token || !code) {
          throw new Error('Sessão inválida. Faça login novamente.');
        }

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
              redirectUri: `${window.location.origin}/`,
            }),
          }
        );

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          const detailedError = payload?.details?.error_description;
          throw new Error(detailedError || payload?.error || 'Falha ao conectar Google Calendar');
        }

        if (active) {
          toast.success('Google Calendar conectado com sucesso!');
        }
      } catch (exchangeError) {
        if (active) {
          toast.error(
            exchangeError instanceof Error ? exchangeError.message : 'Erro ao conectar Google Calendar'
          );
        }
      } finally {
        clearQuery();
        if (active) {
          setProcessingCalendarOauth(false);
        }
      }
    };

    void runExchange();

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, calendarConnected, fetchData]);

  if (loading || processingCalendarOauth) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div
        className={cn(
          'shrink-0 transition-all duration-300 ease-in-out overflow-hidden border-r border-sidebar-border',
          sidebarOpen ? 'w-[280px]' : 'w-0'
        )}
      >
        <AppSidebar />
      </div>
      <TaskList />
    </div>
  );
};

export default Index;
