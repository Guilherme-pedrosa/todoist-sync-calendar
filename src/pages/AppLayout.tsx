import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTaskStore } from '@/store/taskStore';
import { AppSidebar } from '@/components/AppSidebar';
import { QuickAddDialog } from '@/components/QuickAddDialog';
import { AIAssistantPanel } from '@/components/AIAssistantPanel';
import { MobileFab } from '@/components/MobileFab';
import { TaskDetailPanel } from '@/components/TaskDetailPanel';
import { RecurringEditDialog } from '@/components/RecurringEditDialog';
import { CommandPalette } from '@/components/CommandPalette';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { MobileTopBar } from '@/components/MobileTopBar';
import { InstallPwaBanner } from '@/components/InstallPwaBanner';
import { ChatLauncher } from '@/components/ChatLauncher';
import { MentionNotifier } from '@/components/MentionNotifier';
import { ChatNotifier } from '@/components/ChatNotifier';
import { NotificationBell } from '@/components/NotificationBell';

import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { subscribeToTaskRealtime, unsubscribeFromTaskRealtime } from '@/lib/realtimeTasks';
import { ENABLE_GOOGLE_CALENDAR } from '@/config/featureFlags';

export default function AppLayout() {
  const sidebarOpen = useTaskStore((s) => s.sidebarOpen);
  const loading = useTaskStore((s) => s.loading);
  const fetchData = useTaskStore((s) => s.fetchData);
  const { user, calendarConnected } = useAuth();
  const [processingCalendarOauth, setProcessingCalendarOauth] = useState(false);

  useGlobalShortcuts();
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  useActivityTracker(user ? currentWorkspaceId : null);

  const location = useLocation();
  // Close mobile sidebar on route change
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      useTaskStore.setState({ sidebarOpen: false });
    }
  }, [location.pathname]);

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
              redirectUri: `${window.location.origin}/calendar-callback`,
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
      // Boot único do workspaceStore — todas as páginas consomem do store.
      void useWorkspaceStore.getState().fetchWorkspaces();
    }
  }, [user, calendarConnected, fetchData]);

  // Realtime: refetch tarefas/projetos quando colaboradores fazem mudanças
  useEffect(() => {
    if (!user) return;
    subscribeToTaskRealtime(user.id);
    return () => unsubscribeFromTaskRealtime();
  }, [user]);

  // Refetch ao voltar para a aba/janela — garante que mudanças feitas em outros
  // dispositivos (ex.: nova atribuição) apareçam mesmo se o realtime cair.
  useEffect(() => {
    if (!user) return;
    const refetch = () => { void fetchData(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') refetch(); };
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, fetchData]);

  if (loading || processingCalendarOauth) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const closeSidebar = () => useTaskStore.setState({ sidebarOpen: false });

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar: inline, takes width */}
      <div
        className={cn(
          'hidden lg:block shrink-0 transition-all duration-300 ease-in-out overflow-hidden border-r border-sidebar-border',
          sidebarOpen ? 'w-[280px]' : 'w-0'
        )}
      >
        <AppSidebar />
      </div>

      {/* Mobile sidebar: overlay drawer with backdrop */}
      <div
        className={cn(
          'lg:hidden fixed inset-0 z-50 transition-opacity duration-200',
          sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        aria-hidden={!sidebarOpen}
      >
        <button
          aria-label="Fechar menu"
          onClick={closeSidebar}
          className="absolute inset-0 bg-black/60"
        />
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-[85vw] max-w-[320px] border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-out flex flex-col pt-safe pb-safe',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <AppSidebar />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 pb-[calc(56px+env(safe-area-inset-bottom))] lg:pb-0">
        <MobileTopBar />
        <Outlet />
      </div>
      <QuickAddDialog />
      <MobileFab />
      <TaskDetailPanel />
      <CommandPalette />
      <MobileBottomNav />
      <InstallPwaBanner />
      <RecurringEditDialog />
      <AIAssistantPanel />
      <ChatLauncher />
      <MentionNotifier />
      <ChatNotifier />
      {/* Floating notification bell — desktop only (mobile has it in topbar) */}
      <div className="hidden lg:block fixed top-3 right-3 z-40">
        <NotificationBell />
      </div>
    </div>
  );
}
