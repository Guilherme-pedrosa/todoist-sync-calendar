import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Filter as FilterIcon, Menu } from 'lucide-react';
import { useTaskStore } from '@/store/taskStore';
import { TaskItem } from '@/components/TaskItem';
import { Task } from '@/types/task';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { KanbanBoard } from '@/components/KanbanBoard';
import { ViewModeToolbar } from '@/components/ViewModeToolbar';
import { useViewPref } from '@/hooks/useViewPref';

interface FilterRow {
  id: string;
  name: string;
  query: string;
  color: string;
}

// Very small DSL: supports `today`, `overdue`, `no date`, `p1..p4`, `@label`, `#project`, combinations with `&` and `|`.
function evalFilter(query: string, task: Task, projects: any[], labels: any[]): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const tokens = query
    .toLowerCase()
    .split(/\s*\|\s*/)
    .map((or) => or.split(/\s*&\s*/));

  const matchToken = (tok: string): boolean => {
    tok = tok.trim();
    if (!tok) return true;
    if (tok === 'today' || tok === 'hoje') return task.dueDate === today;
    if (tok === 'overdue' || tok === 'atrasada' || tok === 'atrasadas')
      return !!task.dueDate && task.dueDate < today && !task.completed;
    if (tok === 'no date' || tok === 'sem data') return !task.dueDate;
    const pm = /^p([1-4])$/.exec(tok);
    if (pm) return task.priority === Number(pm[1]);
    if (tok.startsWith('@')) {
      const name = tok.slice(1);
      const label = labels.find((l) => l.name.toLowerCase() === name);
      return !!label && task.labels.includes(label.id);
    }
    if (tok.startsWith('#')) {
      const name = tok.slice(1);
      const project = projects.find((p) => p.name.toLowerCase() === name);
      return !!project && task.projectId === project.id;
    }
    // fallback: substring on title
    return task.title.toLowerCase().includes(tok);
  };

  return tokens.some((andGroup) => andGroup.every(matchToken));
}

export default function FilterPage() {
  const { filterId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tasks = useTaskStore((s) => s.tasks);
  const projects = useTaskStore((s) => s.projects);
  const labels = useTaskStore((s) => s.labels);
  const toggleSidebar = useTaskStore((s) => s.toggleSidebar);
  const [filter, setFilter] = useState<FilterRow | null>(null);
  const [viewPref, setViewPref] = useViewPref(`filter:${filterId}`, { mode: 'list', groupBy: 'priority' });

  useEffect(() => {
    if (!user || !filterId) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('filters')
        .select('id,name,query,color')
        .eq('id', filterId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!active) return;
      if (!data) {
        navigate('/today');
        return;
      }
      setFilter(data as FilterRow);
    })();
    return () => {
      active = false;
    };
  }, [user, filterId, navigate]);

  const matched = useMemo(() => {
    if (!filter) return [];
    return tasks
      .filter((t) => !t.completed && !t.parentId)
      .filter((t) => evalFilter(filter.query, t, projects, labels));
  }, [filter, tasks, projects, labels]);

  if (!filter) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Carregando filtro…
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-3 px-6 py-5 border-b border-border/50">
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-1.5 rounded-md hover:bg-muted transition-colors"
          aria-label="Alternar barra lateral"
        >
          <Menu className="h-5 w-5" />
        </button>
        <FilterIcon className="h-5 w-5" style={{ color: filter.color }} />
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">{filter.name}</h2>
          <p className="text-xs text-muted-foreground font-mono">{filter.query}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ViewModeToolbar
            mode={viewPref.mode}
            groupBy={viewPref.groupBy}
            onChangeMode={(m) => setViewPref({ ...viewPref, mode: m })}
            onChangeGroupBy={(g) => setViewPref({ ...viewPref, groupBy: g })}
            groupOptions={['priority', 'date', 'label', 'project', 'status']}
          />
          <span className="text-sm text-muted-foreground">
            {matched.length} tarefa{matched.length !== 1 ? 's' : ''}
          </span>
        </div>
      </header>

      {viewPref.mode === 'kanban' ? (
        <KanbanBoard tasks={matched} boardKey={`filter:${filterId}`} />
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3">
          {matched.map((t) => (
            <TaskItem key={t.id} task={t} />
          ))}
          {matched.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-medium text-muted-foreground">
                Nenhuma tarefa corresponde a este filtro
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
