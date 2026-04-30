import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { TaskItem } from '@/components/TaskItem';
import { CheckCircle2, Flame, TrendingUp, Trophy, Menu } from 'lucide-react';
import {
  format,
  isToday,
  isYesterday,
  parseISO,
  startOfWeek,
  isSameWeek,
  differenceInCalendarDays,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Task } from '@/types/task';
import { cn } from '@/lib/utils';

export default function CompletedPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const toggleSidebar = useTaskStore((s) => s.toggleSidebar);

  const completed = useMemo(
    () => tasks.filter((t) => t.completed && t.completedAt),
    [tasks]
  );

  const stats = useMemo(() => {
    const today = new Date();
    const todayCount = completed.filter((t) => isToday(parseISO(t.completedAt!))).length;
    const weekCount = completed.filter((t) =>
      isSameWeek(parseISO(t.completedAt!), today, { weekStartsOn: 1 })
    ).length;
    const total = completed.length;

    // Streak: dias consecutivos com pelo menos 1 conclusão até hoje
    const dates = new Set(
      completed.map((t) => format(parseISO(t.completedAt!), 'yyyy-MM-dd'))
    );
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const k = format(d, 'yyyy-MM-dd');
      if (dates.has(k)) streak++;
      else if (i > 0) break;
      else if (!dates.has(k)) break;
    }

    // Karma rough: 5 por tarefa + bonus streak
    const karma = total * 5 + streak * 10;
    return { todayCount, weekCount, total, streak, karma };
  }, [completed]);

  const grouped = useMemo(() => {
    const map = new Map<string, Task[]>();
    const sorted = [...completed].sort((a, b) =>
      (b.completedAt || '').localeCompare(a.completedAt || '')
    );
    for (const t of sorted) {
      const d = parseISO(t.completedAt!);
      let key: string;
      if (isToday(d)) key = 'Hoje';
      else if (isYesterday(d)) key = 'Ontem';
      else if (differenceInCalendarDays(new Date(), d) < 7)
        key = format(d, "EEEE", { locale: ptBR });
      else key = format(d, "d 'de' MMMM", { locale: ptBR });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [completed]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-3 px-6 py-5 border-b border-border/50">
        <button
          onClick={toggleSidebar}
          className="hidden p-1.5 rounded-md hover:bg-muted transition-colors"
          aria-label="Alternar barra lateral"
        >
          <Menu className="h-5 w-5" />
        </button>
        <CheckCircle2 className="h-5 w-5 text-success" />
        <h2 className="font-display text-xl font-bold tracking-tight">Concluídas</h2>
        <span className="text-sm text-muted-foreground ml-1">
          {stats.total} no total
        </span>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-4">
        {/* Karma stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={Trophy}
            label="Karma"
            value={stats.karma}
            color="text-warning"
            bg="bg-warning/10"
          />
          <StatCard
            icon={Flame}
            label="Sequência"
            value={`${stats.streak}d`}
            color="text-destructive"
            bg="bg-destructive/10"
          />
          <StatCard
            icon={CheckCircle2}
            label="Hoje"
            value={stats.todayCount}
            color="text-success"
            bg="bg-success/10"
          />
          <StatCard
            icon={TrendingUp}
            label="Esta semana"
            value={stats.weekCount}
            color="text-primary"
            bg="bg-primary/10"
          />
        </div>

        {/* Lista agrupada por dia */}
        {grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <CheckCircle2 className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Nada concluído ainda
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Suas tarefas concluídas aparecem aqui.
            </p>
          </div>
        )}

        {grouped.map(([group, ts]) => (
          <div key={group}>
            <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2 capitalize">
              {group} <span className="text-muted-foreground/60 normal-case font-normal">· {ts.length}</span>
            </h3>
            {ts.map((t) => (
              <TaskItem key={t.id} task={t} enableDrag={false} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: typeof Trophy;
  label: string;
  value: string | number;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center', bg)}>
          <Icon className={cn('h-4 w-4', color)} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={cn('text-lg font-display font-bold', color)}>{value}</div>
        </div>
      </div>
    </div>
  );
}
