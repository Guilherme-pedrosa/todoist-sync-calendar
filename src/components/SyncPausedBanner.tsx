import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function SyncPausedBanner() {
  const { user } = useAuth();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('user_settings')
        .select('sync_paused_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cancelled) setPaused(!!data?.sync_paused_at);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!paused) return null;

  return (
    <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>
        Sincronização com Google Calendar e Todoist <strong>pausada</strong> durante a migração para
        workspaces de equipe (Fase 1). Será reativada na Fase 2.
      </span>
    </div>
  );
}
