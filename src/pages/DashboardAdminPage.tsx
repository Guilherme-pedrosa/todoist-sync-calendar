import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Save, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

type Row = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  enabled: boolean;
  auvo_tecnico_name: string | null;
  goal_count: number;
  goal_note: string | null;
  current_count: number;
};

export default function DashboardAdminPage() {
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [tecnicos, setTecnicos] = useState<string[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('productivity_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      setIsAdmin(!!data);
      setChecking(false);
    })();
  }, [user]);

  const load = async () => {
    setLoading(true);
    // 1) all workspace users (from profiles table)
    const { data: profs } = await supabase
      .from('profiles')
      .select('user_id, display_name, email');
    // 2) existing settings
    const { data: sets } = await (supabase as any)
      .from('dashboard_orcamento_settings')
      .select('user_id, enabled, auvo_tecnico_name, goal_count, goal_note');
    // 3) tecnico counts from Auvo
    const { data: aggData, error: aggErr } = await supabase.functions.invoke('orcamento-a-fazer', { body: {} });
    if (aggErr) toast.error('Falha ao buscar dados do Auvo GC Sync');

    const t: string[] = (aggData?.tecnicos as string[] | undefined) ?? [];
    const totalsMap: Record<string, number> = (aggData?.totals as any) ?? {};
    setTecnicos(t);
    setTotals(totalsMap);

    const setsByUser = new Map<string, any>((sets || []).map((r: any) => [r.user_id, r]));
    const built: Row[] = (profs || []).map((p: any) => {
      const s = setsByUser.get(p.user_id);
      const auvo = s?.auvo_tecnico_name || null;
      return {
        user_id: p.user_id,
        display_name: p.display_name,
        email: p.email ?? null,
        enabled: !!s?.enabled,
        auvo_tecnico_name: auvo,
        goal_count: s?.goal_count ?? 0,
        goal_note: s?.goal_note ?? null,
        current_count: auvo ? totalsMap[auvo] ?? 0 : 0,
      };
    }).sort((a, b) => (a.display_name || a.email || '').localeCompare(b.display_name || b.email || ''));

    setRows(built);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const patchRow = (userId: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.user_id === userId ? { ...r, ...patch,
      current_count: (patch.auvo_tecnico_name !== undefined)
        ? (patch.auvo_tecnico_name ? totals[patch.auvo_tecnico_name] ?? 0 : 0)
        : r.current_count,
    } : r)));
  };

  const saveRow = async (r: Row) => {
    setSaving(r.user_id);
    const payload = {
      user_id: r.user_id,
      enabled: r.enabled,
      auvo_tecnico_name: r.auvo_tecnico_name,
      goal_count: Number(r.goal_count) || 0,
      goal_note: r.goal_note,
    };
    const { error } = await (supabase as any)
      .from('dashboard_orcamento_settings')
      .upsert(payload, { onConflict: 'user_id' });
    setSaving(null);
    if (error) toast.error('Falha ao salvar: ' + error.message);
    else toast.success('Salvo');
  };

  const totalAFazer = useMemo(
    () => Object.values(totals).reduce((a, b) => a + b, 0),
    [totals],
  );

  if (checking) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <Card>
          <CardContent className="pt-6 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <p className="font-medium">Acesso restrito</p>
              <p className="text-sm text-muted-foreground">Somente administradores podem configurar o Dashboard.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Configuração do Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Habilite usuários, mapeie ao técnico do Auvo GC Sync e defina a meta de redução dos orçamentos "A Fazer".
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar Auvo
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Panorama</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <div>Total geral "A Fazer": <span className="font-bold">{totalAFazer}</span></div>
          <div className="text-muted-foreground mt-1">
            {tecnicos.length} técnico(s) com orçamentos em aberto no Auvo.
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.user_id}>
              <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-3">
                  <Label className="text-xs">Usuário</Label>
                  <div className="text-sm font-medium truncate">{r.display_name || '(sem nome)'}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                </div>

                <div className="md:col-span-2 flex items-center gap-2 pb-1">
                  <Switch
                    checked={r.enabled}
                    onCheckedChange={(v) => patchRow(r.user_id, { enabled: v })}
                    id={`en-${r.user_id}`}
                  />
                  <Label htmlFor={`en-${r.user_id}`} className="text-sm">Mostrar</Label>
                </div>

                <div className="md:col-span-3">
                  <Label className="text-xs">Técnico no Auvo</Label>
                  <Select
                    value={r.auvo_tecnico_name || '__none__'}
                    onValueChange={(v) => patchRow(r.user_id, { auvo_tecnico_name: v === '__none__' ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— nenhum —</SelectItem>
                      {tecnicos.map((t) => (
                        <SelectItem key={t} value={t}>{t} ({totals[t] ?? 0})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-1">
                  <Label className="text-xs">Atual</Label>
                  <div className="h-9 flex items-center font-semibold tabular-nums">
                    {r.current_count}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <Label className="text-xs">Meta (≤)</Label>
                  <Input
                    type="number" min={0}
                    value={r.goal_count}
                    onChange={(e) => patchRow(r.user_id, { goal_count: Number(e.target.value) || 0 })}
                  />
                </div>

                <div className="md:col-span-1 flex justify-end">
                  <Button size="sm" onClick={() => saveRow(r)} disabled={saving === r.user_id}>
                    {saving === r.user_id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <><Save className="h-4 w-4 mr-1" /> Salvar</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
