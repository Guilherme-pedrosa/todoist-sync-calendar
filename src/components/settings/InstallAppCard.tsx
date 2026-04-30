import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Smartphone, Share, Check } from 'lucide-react';

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

  if (installed) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
        <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Check className="size-5" />
        </div>
        <div className="space-y-1">
          <h4 className="font-medium text-sm">App instalado</h4>
          <p className="text-xs text-muted-foreground">
            Você está usando o TaskFlow no modo aplicativo. Aproveite a experiência em tela cheia.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Smartphone className="size-5" />
        </div>
        <div className="space-y-1 flex-1">
          <h4 className="font-medium text-sm">Instalar TaskFlow no seu dispositivo</h4>
          <p className="text-xs text-muted-foreground">
            Tenha um ícone próprio na tela inicial e abra o TaskFlow em tela cheia, sem barra do navegador.
          </p>
        </div>
      </div>

      {platform === 'ios' ? (
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">Como instalar no iPhone/iPad:</p>
          <ol className="space-y-1.5 list-decimal list-inside">
            <li>
              Toque no ícone <Share className="inline size-3.5 -mt-0.5" /> <span className="font-medium">Compartilhar</span> no Safari
            </li>
            <li>Role e escolha <span className="font-medium">"Adicionar à Tela de Início"</span></li>
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
              Abra o menu do navegador (⋮) e toque em <span className="font-medium text-foreground">"Instalar app"</span> ou <span className="font-medium text-foreground">"Adicionar à tela inicial"</span>.
            </>
          ) : (
            <>
              No Chrome/Edge, clique no ícone de instalação <Download className="inline size-3.5 -mt-0.5" /> na barra de endereço, ou abra o menu e escolha <span className="font-medium text-foreground">"Instalar TaskFlow"</span>.
            </>
          )}
        </div>
      )}
    </div>
  );
}
