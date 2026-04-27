import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function InstallPwaBanner() {
  const { user } = useAuth();
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true); // start hidden

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('user_settings')
        .select('dismissed_install_prompt')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!active) return;
      setDismissed(!!(data as any)?.dismissed_install_prompt);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = async () => {
    setDismissed(true);
    if (user) {
      await supabase
        .from('user_settings')
        .update({ dismissed_install_prompt: true })
        .eq('user_id', user.id);
    }
  };

  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    setEvt(null);
    await dismiss();
  };

  const visible = !!evt && !dismissed;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="lg:hidden fixed bottom-16 left-3 right-3 z-40 bg-card border border-border rounded-xl shadow-lg p-3 flex items-center gap-3"
        >
          <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Download className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">Instalar TaskFlow</p>
            <p className="text-[11px] text-muted-foreground">Adicione à tela inicial</p>
          </div>
          <button
            onClick={install}
            className="text-xs font-semibold text-primary hover:underline px-2"
          >
            Instalar
          </button>
          <button
            onClick={dismiss}
            aria-label="Dispensar"
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
