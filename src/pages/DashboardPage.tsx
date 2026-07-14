import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, Target, TrendingDown, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

type Settings = {
  enabled: boolean;
  auvo_tecnico_name: string | null;
  goal_count: number;
  goal_note: string | null;
};

type Aggregate = {
  total: number;
  totals: Record<string, number>;
  updatedAt: string | null;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [agg, setAgg] = useState<Aggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setError(null);
    const [{ data: sRow }, invoke] = await Promise.all([
      (supabase as any)
        .from('dashboard_orcamento_settings')
        .select('enabled, auvo_tecnico_name, goal_count, goal_note')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.functions.invoke('orcamento-a-fazer', { body: {} }),
    ]);
    setSettings((sRow as Settings) ?? {
      enabled: false, auvo_tecnico_name: null, goal_count: 0, goal_note: null,
    });
    if (invoke.error) {
      setError('Não foi possível carregar os dados do Auvo GC Sync.');
    } else {
      setAgg(invoke.data as Aggregate);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [user?.id]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    toast.success('Atualizado');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const enabled = !!settings?.enabled;
  const tecnico = settings?.auvo_tecnico_name?.trim() || null;
  const current = tecnico ? agg?.totals?.[tecnico] ?? 0 : 0;
  const goal = settings?.goal_count ?? 0;
  // meta de REDUÇÃO: quanto mais próximo (ou abaixo) de `goal`, melhor.
  const progressPct = goal > 0
    ? Math.max(0, Math.min(100, ((Math.max(0, current - goal)) / current) * 100))
    : 0;
  const remainingToGoal = Math.max(0, current - goal);
  const reachedGoal = current <= goal;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Meu Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe os orçamentos em "A Fazer" no Kanban Orçamentos do Auvo GC Sync.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {!enabled && (
        <Card>
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <p className="font-medium">Dashboard ainda não liberado para você</p>
              <p className="text-sm text-muted-foreground">
                Peça a um administrador para habilitar seu acesso em Configurações → Dashboard.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {enabled && !tecnico && (
        <Card>
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <p className="font-medium">Técnico não configurado</p>
              <p className="text-sm text-muted-foreground">
                Um administrador precisa vincular seu usuário ao nome do técnico no Auvo.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {enabled && tecnico && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="h-4 w-4 text-primary" />
                Orçamentos "A Fazer" — {tecnico}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-bold tabular-nums">{current}</span>
                <span className="text-sm text-muted-foreground">em aberto</span>
              </div>
              {agg?.updatedAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  Atualizado em {new Date(agg.updatedAt).toLocaleString('pt-BR')}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4 text-primary" />
                Meta de redução
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Reduzir para no máximo <span className="font-semibold text-foreground">{goal}</span>
              </div>
              {goal > 0 ? (
                <>
                  <Progress value={100 - progressPct} className="h-2" />
                  {reachedGoal ? (
                    <p className="text-sm font-medium text-emerald-600">🎯 Meta atingida!</p>
                  ) : (
                    <p className="text-sm">
                      Faltam <span className="font-semibold">{remainingToGoal}</span> a reduzir
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma meta definida.</p>
              )}
              {settings?.goal_note && (
                <p className="text-xs text-muted-foreground italic">{settings.goal_note}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
