import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspaceStore } from '@/store/workspaceStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { addDays, format, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AssignedTask {
  id: string;
  title: string;
  due_date: string;
  user_id: string;
}

export default function WorkloadPage() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrentWorkspace);
  const fetchMembers = useWorkspaceStore((s) => s.fetchMembers);
  const members = useWorkspaceStore((s) => s.members);
  const membersWorkspaceId = useWorkspaceStore((s) => s.membersWorkspaceId);
  const loadingMembers = useWorkspaceStore((s) => s.loadingMembers);

  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  useEffect(() => {
    if (currentWorkspaceId) {
      if (membersWorkspaceId !== currentWorkspaceId) fetchMembers(currentWorkspaceId);
      loadTasks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspaceId, membersWorkspaceId]);

  const showSkeleton = loadingMembers || membersWorkspaceId !== currentWorkspaceId;
  const visibleMembers = membersWorkspaceId === currentWorkspaceId ? members : [];

  const loadTasks = async () => {
    if (!currentWorkspaceId) return;
    const start = format(weekStart, 'yyyy-MM-dd');
    const end = format(addDays(weekStart, 6), 'yyyy-MM-dd');
    const { data } = await supabase
      .from('tasks')
      .select('id, title, due_date, user_id')
      .eq('workspace_id', currentWorkspaceId)
      .eq('completed', false)
      .gte('due_date', start)
      .lte('due_date', end);
    setTasks((data || []) as AssignedTask[]);
  };

  return (
    <div className="flex-1 overflow-auto p-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold">Carga de trabalho</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tarefas com data nesta semana, por pessoa.
          </p>
        </div>
        <Select value={currentWorkspaceId ?? ''} onValueChange={setCurrentWorkspace}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Workspace" />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name} {w.isPersonal && '(pessoal)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-auto border border-border rounded-lg bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left p-3 font-medium w-[200px]">Pessoa</th>
              {days.map((d) => (
                <th key={d.toISOString()} className="p-3 font-medium text-center">
                  <div className="text-xs uppercase text-muted-foreground">
                    {format(d, 'EEE', { locale: ptBR })}
                  </div>
                  <div>{format(d, 'dd/MM')}</div>
                </th>
              ))}
              <th className="p-3 font-medium text-center w-[80px]">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center p-6 text-muted-foreground">
                  Nenhum membro.
                </td>
              </tr>
            )}
            {members.map((m) => {
              const memberTasks = tasks.filter((t) => t.user_id === m.userId);
              const total = memberTasks.length;
              const overload = total > 15;
              return (
                <tr key={m.userId} className={overload ? 'bg-destructive/5' : ''}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={m.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {(m.displayName || '?').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{m.displayName || m.userId.slice(0, 8)}</span>
                    </div>
                  </td>
                  {days.map((d) => {
                    const dayStr = format(d, 'yyyy-MM-dd');
                    const dayTasks = memberTasks.filter((t) => t.due_date === dayStr);
                    return (
                      <td key={dayStr} className="p-2 text-center align-top">
                        {dayTasks.length === 0 ? (
                          <span className="text-muted-foreground/50">—</span>
                        ) : (
                          <div className="flex flex-col gap-1 items-center">
                            <span
                              className={`px-2 py-0.5 text-xs rounded-full ${
                                dayTasks.length > 5
                                  ? 'bg-destructive/20 text-destructive'
                                  : 'bg-primary/15 text-primary'
                              }`}
                            >
                              {dayTasks.length}
                            </span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-3 text-center font-medium">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
