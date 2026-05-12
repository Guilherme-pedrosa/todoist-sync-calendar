import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Smartphone, Share, Check, Bell, BellOff, Loader2 } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'other' as const;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) return 'ios' as const;
  if (/Android/.test(ua)) return 'android' as const;
  return 'desktop' as const;
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}

export function InstallAppCard() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [platform] = useState(detectPlatform());

  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferred(null);
  };

  return (
    <div className="space-y-3">
      {/* CARD: INSTALAR */}
      {installed ? (
        <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
          <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Check className="size-5" />
          </div>
          <div className="space-y-1">
            <h4 className="font-medium text-sm">App instalado</h4>
            <p className="text-xs text-muted-foreground">
              Você está usando o TaskFlow no modo aplicativo.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Smartphone className="size-5" />
            </div>
            <div className="space-y-1 flex-1">
              <h4 className="font-medium text-sm">Instalar TaskFlow no seu dispositivo</h4>
              <p className="text-xs text-muted-foreground">
                Tenha um ícone próprio na tela inicial e abra em tela cheia, sem barra do navegador.
              </p>
            </div>
          </div>

          {platform === 'ios' ? (
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Como instalar no iPhone/iPad:</p>
              <ol className="space-y-1.5 list-decimal list-inside">
                <li>
                  Toque em <Share className="inline size-3.5 -mt-0.5" />{' '}
                  <span className="font-medium">Compartilhar</span> no Safari
                </li>
                <li>Escolha <span className="font-medium">"Adicionar à Tela de Início"</span></li>
                <li>Toque em <span className="font-medium">Adicionar</span></li>
              </ol>
            </div>
          ) : deferred ? (
            <Button onClick={handleInstall} className="w-full gap-2">
              <Download className="size-4" />
              Instalar app
            </Button>
          ) : (
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              {platform === 'android' ? (
                <>
                  Abra o menu do navegador (⋮) e toque em{' '}
                  <span className="font-medium text-foreground">"Instalar app"</span> ou{' '}
                  <span className="font-medium text-foreground">"Adicionar à tela inicial"</span>.
                </>
              ) : (
                <>
                  No Chrome/Edge, clique no ícone <Download className="inline size-3.5 -mt-0.5" /> na
                  barra de endereço, ou no menu escolha{' '}
                  <span className="font-medium text-foreground">"Instalar TaskFlow"</span>.
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* CARD: PUSH NOTIFICATIONS */}
      <PushNotificationsCard platform={platform} installed={installed} />
    </div>
  );
}

function PushNotificationsCard({
  platform,
  installed,
}: {
  platform: 'ios' | 'android' | 'desktop' | 'other';
  installed: boolean;
}) {
  const { state, supported, subscribe, unsubscribe, sendTest } = usePushNotifications();
  const [busy, setBusy] = useState(false);

  const iosNeedsInstall = platform === 'ios' && !installed;

  const handleEnable = async () => {
    setBusy(true);
    const ok = await subscribe();
    setBusy(false);
    if (ok) {
      toast.success('Notificações ativadas!');
      try {
        await sendTest();
      } catch {}
    } else if (state === 'denied') {
      toast.error('Permissão negada. Ative manualmente nas configurações do navegador.');
    } else if (platform === 'ios' && !installed) {
      toast.error('No iPhone, instale o app na tela inicial primeiro (Compartilhar → Adicionar à Tela de Início).');
    } else {
      toast.error('Não foi possível registrar este dispositivo. Verifique o console (F12).');
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    await unsubscribe();
    setBusy(false);
    toast.success('Notificações desativadas');
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      await sendTest();
      toast.success('Teste enviado! Veja a notificação.');
    } catch (e: any) {
      toast.error('Falha ao enviar teste');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Bell className="size-5" />
        </div>
        <div className="space-y-1 flex-1">
          <h4 className="font-medium text-sm">Notificações push</h4>
          <p className="text-xs text-muted-foreground">
            Receba alertas no celular/computador quando alguém te atribuir uma tarefa, mesmo com o
            app fechado.
          </p>
        </div>
      </div>

      {!supported && (
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          Seu navegador não suporta notificações push.
        </div>
      )}

      {supported && iosNeedsInstall && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-400">
          <strong>iPhone/iPad:</strong> notificações push só funcionam após você{' '}
          <strong>instalar o TaskFlow na tela inicial</strong> (passo acima). Depois de instalado,
          abra pelo ícone e ative aqui.
        </div>
      )}

      {supported && state === 'denied' && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive">
          Permissão bloqueada. Vá em configurações do navegador → Notificações → permitir para este
          site.
        </div>
      )}

      {supported && !iosNeedsInstall && state !== 'denied' && (
        <div className="flex flex-wrap gap-2">
          {state === 'subscribed' ? (
            <>
              <Button variant="outline" size="sm" onClick={handleTest} disabled={busy} className="gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
                Enviar teste
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisable}
                disabled={busy}
                className="gap-2"
              >
                <BellOff className="size-4" />
                Desativar
              </Button>
            </>
          ) : (
            <Button onClick={handleEnable} disabled={busy || state === 'loading'} className="gap-2">
              {busy || state === 'loading' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Bell className="size-4" />
              )}
              Ativar notificações
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
