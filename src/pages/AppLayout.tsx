import { useCallback, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTaskStore } from '@/store/taskStore';
import { AppSidebar } from '@/components/AppSidebar';
import { QuickAddDialog } from '@/components/QuickAddDialog';
import { AIAssistantPanel } from '@/components/AIAssistantPanel';

import { TaskDetailPanel } from '@/components/TaskDetailPanel';
import { RecurringEditDialog } from '@/components/RecurringEditDialog';
import { CompleteSubtasksDialog } from '@/components/CompleteSubtasksDialog';
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
import { subscribeToTaskRealtime, unsubscribeFromTaskRealtime } from '@/lib/realtimeTasks';
import { supabase } from '@/integrations/supabase/client';


export default function AppLayout() {
  const sidebarOpen = useTaskStore((s) => s.sidebarOpen);
  const loading = useTaskStore((s) => s.loading);
  const hasTasks = useTaskStore((s) => s.tasks.length > 0);
  const fetchData = useTaskStore((s) => s.fetchData);
  const { user } = useAuth();
  const fetchInFlightRef = useRef<Promise<void> | null>(null);
  const lastFetchRef = useRef(0);
  const lastSyncAtRef = useRef<string>(new Date().toISOString());

  useGlobalShortcuts();
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  useActivityTracker(user ? currentWorkspaceId : null);

  const location = useLocation();
  const refetchData = useCallback(
    (scope: 'hot' | 'full' = 'hot') => {
      const now = Date.now();
      if (fetchInFlightRef.current) return fetchInFlightRef.current;
      if (now - lastFetchRef.current < 5000) return Promise.resolve();

      lastFetchRef.current = now;
      const request = fetchData({ scope }).finally(() => {
        fetchInFlightRef.current = null;
        lastSyncAtRef.current = new Date().toISOString();
      });
      fetchInFlightRef.current = request;
      return request;
    },
    [fetchData]
  );

  // Close mobile sidebar on route change
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      useTaskStore.setState({ sidebarOpen: false });
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    // Limpa qualquer query string residual de fluxo OAuth removido.
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('code') || sp.get('error')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      refetchData('hot');
      void useWorkspaceStore.getState().fetchWorkspaces();
    }
  }, [user, refetchData]);

  // Realtime: refetch tarefas/projetos quando colaboradores fazem mudanças
  useEffect(() => {
    if (!user) return;
    subscribeToTaskRealtime(user.id);
    return () => unsubscribeFromTaskRealtime();
  }, [user]);

  // Ao voltar para a aba, busca apenas o delta (updated_at > último sync).
  // Nunca recarrega o banco inteiro — só cai para carga completa se o delta for grande.
  useEffect(() => {
    if (!user) return;

    const syncDelta = async () => {
      const since = lastSyncAtRef.current;
      const startedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from('tasks')
        .select('*, task_labels(label_id), task_assignees(user_id, role), meeting_invitations(invitee_user_id)')
        .gt('updated_at', since)
        .order('updated_at', { ascending: true })
        .limit(201);

      if (error) {
        console.warn('[delta-sync] falhou', error);
        return;
      }

      if ((data?.length ?? 0) > 200) {
        void refetchData('full');
        return;
      }

      const store = useTaskStore.getState();
      for (const row of data || []) {
        if ((row as any).deleted_at) store.applyTaskDelete((row as any).id);
        else store.applyTaskUpsertFromDb(row);
      }
      lastSyncAtRef.current = startedAt;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void syncDelta();
    };
    const onFocus = () => { void syncDelta(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, refetchData]);

  if (loading && !hasTasks) {
    return (
      <div className="flex items-center justify-center h-[100dvh] bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }


  const closeSidebar = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    useTaskStore.setState({ sidebarOpen: false });
  };

  return (
    <div className="flex h-[100dvh] min-h-[100svh] overflow-hidden bg-background">
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
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 opacity-100 pointer-events-auto transition-opacity duration-200">
          <button
            aria-label="Fechar menu"
            onClick={closeSidebar}
            className="absolute inset-0 bg-black/60"
          />
          <div className="absolute inset-y-0 left-0 w-[min(88vw,340px)] border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-out flex flex-col pt-safe pb-safe translate-x-0 shadow-2xl">
            <AppSidebar />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 min-w-0 max-lg:overflow-hidden pb-[calc(56px+env(safe-area-inset-bottom))] lg:pb-0 lg:pr-14">
        <MobileTopBar />
        <Outlet />
      </div>
      <QuickAddDialog />

      <TaskDetailPanel />
      <CommandPalette />
      <MobileBottomNav />
      <InstallPwaBanner />
      <RecurringEditDialog />
      <CompleteSubtasksDialog />
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
