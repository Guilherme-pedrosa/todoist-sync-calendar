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
import { InstallPwaBanner } from '@/components/InstallPwaBanner';

import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function AppLayout() {
  const sidebarOpen = useTaskStore((s) => s.sidebarOpen);
  const loading = useTaskStore((s) => s.loading);
  const fetchData = useTaskStore((s) => s.fetchData);
  const { user, calendarConnected } = useAuth();
  const [processingCalendarOauth, setProcessingCalendarOauth] = useState(false);

  useGlobalShortcuts();

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
    }
  }, [user, calendarConnected, fetchData]);

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
          className="absolute inset-0 bg-black/50"
        />
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-[280px] max-w-[85vw] border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-out',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <AppSidebar />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 pb-14 lg:pb-0">
        
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
    </div>
  );
}
