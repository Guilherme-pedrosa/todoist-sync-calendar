import { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ActivityRow {
  id: string;
  user_id: string | null;
  action: string;
  payload: any;
  created_at: string;
}

interface ProfileLite {
  display_name: string | null;
  email: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Título',
  description: 'Descrição',
  due_date: 'Data',
  due_time: 'Horário',
  priority: 'Prioridade',
  project_id: 'Projeto',
  section_id: 'Seção',
  duration_minutes: 'Duração (min)',
};

function formatValue(field: string, value: any): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'priority') return `P${value}`;
  if (field === 'due_date' || field === 'due_time') return String(value);
  return String(value);
}

function actionTitle(row: ActivityRow): string {
  switch (row.action) {
    case 'created': return 'criou a tarefa';
    case 'completed': return 'concluiu a tarefa';
    case 'reopened': return 'reabriu a tarefa';
    case 'updated': return 'alterou a tarefa';
    case 'assignee_added': return 'adicionou um responsável';
    case 'assignee_removed': return 'removeu um responsável';
    case 'message_sent': return 'enviou uma mensagem';
    default: return row.action;
  }
}

export function TaskActivityLog({ taskId }: { taskId: string }) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [sectionNames, setSectionNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('task_activity_log')
        .select('id, user_id, action, payload, created_at')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        console.error('[activity-log]', error);
        setLoading(false);
        return;
      }
      setRows((data || []) as ActivityRow[]);

      const userIds = Array.from(
        new Set((data || []).map((r: any) => r.user_id).filter(Boolean))
      ) as string[];
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, display_name, email')
          .in('user_id', userIds);
        if (!cancelled && profs) {
          const map: Record<string, ProfileLite> = {};
          for (const p of profs as any[]) {
            map[p.user_id] = { display_name: p.display_name, email: p.email };
          }
          setProfiles(map);
        }
      }

      // Coleta IDs de projetos/seções referenciados pra mostrar nomes
      const projectIds = new Set<string>();
      const sectionIds = new Set<string>();
      for (const r of (data || []) as any[]) {
        const ch = r.action === 'updated' ? r.payload?.changes : null;
        if (ch?.project_id) {
          if (ch.project_id.from) projectIds.add(ch.project_id.from);
          if (ch.project_id.to) projectIds.add(ch.project_id.to);
        }
        if (ch?.section_id) {
          if (ch.section_id.from) sectionIds.add(ch.section_id.from);
          if (ch.section_id.to) sectionIds.add(ch.section_id.to);
        }
        if (r.action === 'created' && r.payload?.project_id) projectIds.add(r.payload.project_id);
      }

      if (projectIds.size > 0) {
        const { data: projs } = await supabase
          .from('projects')
          .select('id, name')
          .in('id', Array.from(projectIds));
        if (!cancelled && projs) {
          const map: Record<string, string> = {};
          for (const p of projs as any[]) map[p.id] = p.name;
          setProjectNames(map);
        }
      }
      if (sectionIds.size > 0) {
        const { data: secs } = await supabase
          .from('sections')
          .select('id, name')
          .in('id', Array.from(sectionIds));
        if (!cancelled && secs) {
          const map: Record<string, string> = {};
          for (const s of secs as any[]) map[s.id] = s.name;
          setSectionNames(map);
        }
      }

      setLoading(false);
    };
    void load();

    const channel = supabase
      .channel(`task-activity-${taskId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_activity_log', filter: `task_id=eq.${taskId}` },
        () => void load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [taskId]);

  const userName = (uid: string | null) => {
    if (!uid) return 'Sistema';
    const p = profiles[uid];
    return p?.display_name || p?.email || 'Usuário';
  };

  const formatFieldValue = (field: string, value: any): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (field === 'project_id') return projectNames[value] || 'Projeto removido';
    if (field === 'section_id') return sectionNames[value] || 'Seção removida';
    return formatValue(field, value);
  };

  return (
    <div className="pt-4 border-t border-border space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <History className="h-3.5 w-3.5" /> Histórico
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
        </div>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-xs text-muted-foreground/70">Sem atividade registrada</p>
      )}

      <ol className="space-y-2.5">
        {rows.map((r) => {
          const changes = r.action === 'updated' ? (r.payload?.changes || {}) : null;
          return (
            <li key={r.id} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span>
                  <span className="font-medium text-foreground">{userName(r.user_id)}</span>{' '}
                  <span className="text-muted-foreground">{actionTitle(r)}</span>
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {format(parseISO(r.created_at), "d MMM, HH:mm", { locale: ptBR })}
                </span>
              </div>
              {changes && (
                <ul className="mt-1 ml-2 space-y-0.5 border-l border-border pl-2">
                  {Object.entries(changes).map(([field, val]: [string, any]) => (
                    <li key={field} className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {FIELD_LABELS[field] || field}:
                      </span>{' '}
                      <span className="line-through opacity-70">{formatValue(field, val.from)}</span>
                      <span className="mx-1">→</span>
                      <span className="text-foreground">{formatValue(field, val.to)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {r.action === 'message_sent' && r.payload?.snippet && (
                <p className="mt-0.5 text-[11px] text-muted-foreground italic line-clamp-2">
                  "{r.payload.snippet}"
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
