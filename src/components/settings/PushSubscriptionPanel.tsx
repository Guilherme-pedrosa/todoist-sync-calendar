import { useState } from 'react';
import { Bell, BellOff, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function PushSubscriptionPanel() {
  const { status, isSubscribed, busy, subscribe, unsubscribe, sendTest } = usePushSubscription();
  const [testing, setTesting] = useState(false);

  if (status === 'unsupported') {
    return (
      <div className="rounded-md border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        Este navegador não suporta notificações push. Tente Chrome, Firefox ou Edge — ou
        instale o app na tela inicial em iOS 16.4+.
      </div>
    );
  }

  const handleEnable = async () => {
    const r = await subscribe();
    if (r.ok) toast.success('Notificações ativadas neste dispositivo');
    else toast.error(r.error || 'Não foi possível ativar');
  };

  const handleDisable = async () => {
    const r = await unsubscribe();
    if (r.ok) toast.success('Notificações desativadas neste dispositivo');
    else toast.error(r.error || 'Falha ao desativar');
  };

  const handleTest = async () => {
    setTesting(true);
    const r = await sendTest();
    setTesting(false);
    if (r.ok) toast.success('Lembrete de teste enviado — verifique sua tela!');
    else toast.error(r.error || 'Falha no teste');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            isSubscribed ? 'bg-emerald-500' : 'bg-muted-foreground/40',
          )}
        />
        <span className="font-medium">
          {isSubscribed ? 'Ativado neste dispositivo' : 'Desativado'}
        </span>
        {status === 'denied' && (
          <span className="text-xs text-destructive">
            Permissão bloqueada — libere nas configurações do navegador
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!isSubscribed ? (
          <Button onClick={handleEnable} disabled={busy || status === 'denied'} size="sm">
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Bell className="h-4 w-4 mr-1.5" />}
            Ativar notificações
          </Button>
        ) : (
          <>
            <Button onClick={handleTest} disabled={testing} size="sm">
              {testing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              Enviar teste agora
            </Button>
            <Button onClick={handleDisable} disabled={busy} size="sm" variant="outline">
              <BellOff className="h-4 w-4 mr-1.5" />
              Desativar aqui
            </Button>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Em iPhone/iPad, abra este site pelo Safari e use <strong>Compartilhar → Adicionar à
        Tela de Início</strong>. Depois abra pelo ícone instalado e ative aqui.
      </p>
    </div>
  );
}
