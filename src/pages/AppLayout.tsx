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

export default function AppLayout() {
  const sidebarOpen = useTaskStore((s) => s.sidebarOpen);
  const loading = useTaskStore((s) => s.loading);
  const fetchData = useTaskStore((s) => s.fetchData);
  const { user } = useAuth();

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
    // Limpa qualquer query string residual de fluxo OAuth removido.
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('code') || sp.get('error')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchData();
      void useWorkspaceStore.getState().fetchWorkspaces();
    }
  }, [user, fetchData]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
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
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 opacity-100 pointer-events-auto transition-opacity duration-200">
          <button
            aria-label="Fechar menu"
            onClick={closeSidebar}
            className="absolute inset-0 bg-black/60"
          />
          <div className="absolute inset-y-0 left-0 w-[85vw] max-w-[320px] border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-out flex flex-col pt-safe pb-safe translate-x-0">
            <AppSidebar />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 pb-[calc(56px+env(safe-area-inset-bottom))] lg:pb-0 lg:pr-14">
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
