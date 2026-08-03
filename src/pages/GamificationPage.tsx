import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trophy, Flame, Target, RefreshCw, Save, Star } from 'lucide-react';
import { toast } from 'sonner';

type Goals = { daily_goal: number; weekly_goal: number; monthly_goal: number };

const DEFAULT_GOALS: Goals = { daily_goal: 5, weekly_goal: 25, monthly_goal: 100 };

const LEVELS = [
  { level: 1, name: 'Iniciante', xp: 0 },
  { level: 2, name: 'Aprendiz', xp: 10 },
  { level: 3, name: 'Executor', xp: 30 },
  { level: 4, name: 'Produtivo', xp: 75 },
  { level: 5, name: 'Focado', xp: 150 },
  { level: 6, name: 'Veterano', xp: 300 },
  { level: 7, name: 'Mestre', xp: 600 },
  { level: 8, name: 'Lenda', xp: 1000 },
  { level: 9, name: 'Imparável', xp: 1750 },
  { level: 10, name: 'Titã', xp: 3000 },
];

function levelFor(xp: number) {
  let current = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) current = l;
  const next = LEVELS.find((l) => l.xp > xp) ?? null;
  const span = next ? next.xp - current.xp : 1;
  const pct = next ? Math.min(100, ((xp - current.xp) / span) * 100) : 100;
  return { current, next, pct };
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function GamificationPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [dates, setDates] = useState<Date[]>([]);

  const load = async () => {
    if (!user) return;
    const since = new Date();
    since.setDate(since.getDate() - 365);
    const sinceIso = since.toISOString();

    const [{ data: gRow }, tasksRes, recRes] = await Promise.all([
      (supabase as any)
        .from('gamification_settings')
        .select('daily_goal, weekly_goal, monthly_goal')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('tasks')
        .select('completed_at, assignee, user_id')
        .eq('completed', true)
        .gte('completed_at', sinceIso)
        .or(`assignee.eq.${user.id},user_id.eq.${user.id}`)
        .is('deleted_at', null)
        .limit(5000),
      supabase
        .from('recurring_task_completions')
        .select('completed_at')
        .eq('user_id', user.id)
        .gte('completed_at', sinceIso)
        .limit(5000),
    ]);

    if (gRow) setGoals(gRow as Goals);

    const all: Date[] = [];
    for (const t of (tasksRes.data ?? []) as any[]) {
      if (t.completed_at) all.push(new Date(t.completed_at));
    }
    for (const r of (recRes.data ?? []) as any[]) {
      if (r.completed_at) all.push(new Date(r.completed_at));
    }
    setDates(all);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const weekStart = startOfDay(new Date(now));
    weekStart.setDate(weekStart.getDate() - ((now.getDay() + 6) % 7)); // segunda-feira
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let day = 0, week = 0, month = 0;
    const perDay = new Map<string, number>();
    for (const d of dates) {
      const k = dayKey(d);
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
      if (d >= today) day++;
      if (d >= weekStart) week++;
      if (d >= monthStart) month++;
    }

    // streak: dias consecutivos (até hoje ou ontem) com pelo menos 1 conclusão
    let streak = 0;
    const cursor = new Date(today);
    if (!perDay.get(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (perDay.get(dayKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    const best = Math.max(0, ...Array.from(perDay.values()));
    return { day, week, month, total: dates.length, streak, best };
  }, [dates]);

  const lv = levelFor(stats.total);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from('gamification_settings')
      .upsert({ user_id: user.id, ...goals }, { onConflict: 'user_id' });
    setSaving(false);
    if (error) toast.error('Não foi possível salvar as metas');
    else toast.success('Metas salvas');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const cards = [
    { label: 'Hoje', value: stats.day, goal: goals.daily_goal },
    { label: 'Esta semana', value: stats.week, goal: goals.weekly_goal },
    { label: 'Este mês', value: stats.month, goal: goals.monthly_goal },
  ];

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" /> Conquistas
          </h1>
          <p className="text-sm text-muted-foreground">Sua evolução com base nas tarefas concluídas.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setLoading(true); void load(); }}>
          <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              Nível {lv.current.level} · {lv.current.name}
            </span>
            <Badge variant="secondary">{stats.total} tarefas concluídas</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={lv.pct} />
          <p className="text-xs text-muted-foreground">
            {lv.next
              ? `Faltam ${lv.next.xp - stats.total} tarefas para o nível ${lv.next.level} (${lv.next.name})`
              : 'Nível máximo alcançado. Monstro!'}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => {
          const pct = c.goal > 0 ? Math.min(100, (c.value / c.goal) * 100) : 0;
          return (
            <Card key={c.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-medium">{c.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-3xl font-bold">
                  {c.value}
                  <span className="text-base font-normal text-muted-foreground"> / {c.goal}</span>
                </div>
                <Progress value={pct} />
                <p className="text-xs text-muted-foreground">
                  {c.value >= c.goal ? '🎉 Meta batida!' : `Faltam ${c.goal - c.value}`}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Flame className="h-8 w-8 text-primary" />
            <div>
              <div className="text-2xl font-bold">{stats.streak} dias</div>
              <p className="text-xs text-muted-foreground">Sequência atual concluindo tarefas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Trophy className="h-8 w-8 text-primary" />
            <div>
              <div className="text-2xl font-bold">{stats.best}</div>
              <p className="text-xs text-muted-foreground">Recorde de tarefas em um único dia</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" /> Minhas metas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {([
              ['daily_goal', 'Por dia'],
              ['weekly_goal', 'Por semana'],
              ['monthly_goal', 'Por mês'],
            ] as const).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  type="number"
                  min={0}
                  value={goals[key]}
                  onChange={(e) => setGoals({ ...goals, [key]: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>
            ))}
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar metas
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
