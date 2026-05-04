// Cliente para a edge function ai-assistant.
// Constrói automaticamente o "contexto" (tarefas agendadas, projetos, feriados)
// para que o backend tenha o que precisa para sugerir bem.

import { supabase } from '@/integrations/supabase/client';
import type { Task, Project } from '@/types/task';
import { getBrazilianHolidays } from '@/lib/holidays';
import { format, addDays, subDays } from 'date-fns';

type ScheduledTaskCtx = {
  title: string;
  date: string;
  time?: string | null;
  durationMinutes?: number | null;
  priority?: number;
  project?: string;
};

function nowIsoWithBrOffset(): string {
  // ISO com offset -03:00 (BR atual, sem DST)
  const now = new Date();
  const brMs = now.getTime() - 3 * 60 * 60 * 1000;
  const d = new Date(brMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}-03:00`;
}

function buildContext(tasks: Task[], projects: Project[], targetDate?: string) {
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const nowTime = format(now, 'HH:mm');
  const nowIso = nowIsoWithBrOffset();
  const horizonEnd = format(addDays(now, 14), 'yyyy-MM-dd');
  const recentStart = subDays(now, 2);
  const projectName = (id?: string) =>
    projects.find((p) => p.id === id)?.name;

  const scheduled: ScheduledTaskCtx[] = tasks
    .filter(
      (t) =>
        !t.completed &&
        !t.parentId &&
        t.dueDate &&
        t.dueDate >= today &&
        t.dueDate <= horizonEnd,
    )
    .map((t) => ({
      title: t.title,
      date: t.dueDate!,
      time: t.dueTime ?? null,
      durationMinutes: t.durationMinutes ?? null,
      priority: t.priority,
      project: projectName(t.projectId),
    }));

  const recentlyCompleted = tasks
    .filter((t) => t.completed && t.completedAt && new Date(t.completedAt) >= recentStart)
    .slice(0, 40)
    .map((t) => ({
      title: t.title,
      completedAt: t.completedAt,
      priority: t.priority,
      project: projectName(t.projectId),
    }));

  const yearNow = new Date().getFullYear();
  const holidays = [
    ...getBrazilianHolidays(yearNow),
    ...getBrazilianHolidays(yearNow + 1),
  ].filter((h) => h.date >= today && h.date <= horizonEnd);

  return {
    today,
    targetDate: targetDate ?? today,
    nowTime,
    nowIso,
    scheduled,
    holidays,
    recentlyCompleted,
    userProfile: {
      timezone: 'America/Sao_Paulo',
      workdayStart: '08:00',
      workdayEnd: '19:00',
      energyPattern: 'Priorize tarefas críticas e analíticas pela manhã.',
    },
  };
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ai-assistant', {
    body,
  });
  if (error) {
    // Tenta extrair mensagem amigável do contexto da edge function
    const ctx: any = (error as any).context;
    let msg = error.message || 'Falha na chamada à IA';
    try {
      if (ctx && typeof ctx.json === 'function') {
        const j = await ctx.json();
        if (j?.error) msg = j.error;
      }
    } catch {}
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any).result as T;
}

export async function suggestSlot(opts: {
  task: {
    title: string;
    description?: string;
    durationMinutes?: number;
    priority?: number;
    deadline?: string | null;
  };
  tasks: Task[];
  projects: Project[];
}) {
  const ctx = buildContext(opts.tasks, opts.projects, opts.task.deadline ?? undefined);
  return invoke<{
    date: string;
    time: string;
    durationMinutes: number;
    reason: string;
  }>({
    action: 'suggest-slot',
    task: opts.task,
    ...ctx,
  });
}

export async function organizeDay(opts: {
  date: string;
  unscheduled: {
    id: string;
    title: string;
    durationMinutes?: number | null;
    priority?: number;
    project?: string;
  }[];
  tasks: Task[];
  projects: Project[];
}) {
  const ctx = buildContext(opts.tasks, opts.projects, opts.date);
  return invoke<{
    assignments: { id: string; date: string; time: string; durationMinutes: number }[];
    summary: string;
  }>({
    action: 'organize-day',
    date: opts.date,
    unscheduled: opts.unscheduled,
    ...ctx,
  });
}

export async function analyzeDay(opts: {
  date: string;
  tasks: Task[];
  projects: Project[];
}) {
  const ctx = buildContext(opts.tasks, opts.projects, opts.date);
  return invoke<{ text: string }>({
    action: 'analyze-day',
    date: opts.date,
    ...ctx,
  });
}

export type AssistantAction =
  | {
      type: 'create_task';
      args: {
        title: string;
        description?: string;
        date?: string;
        time?: string;
        durationMinutes?: number;
        priority?: number;
        projectId?: string;
        recurrenceRule?: string;
        assigneeUserIds?: string[];
      };
    }
  | {
      type: 'update_task';
      args: {
        taskId: string;
        title?: string;
        description?: string;
        date?: string;
        time?: string;
        clearTime?: boolean;
        clearDate?: boolean;
        durationMinutes?: number;
        priority?: number;
        projectId?: string;
      };
    }
  | { type: 'complete_task'; args: { taskId: string } }
  | { type: 'delete_task'; args: { taskId: string } }
  | { type: 'assign_task'; args: { taskId: string; userId: string } }
  | { type: 'unassign_task'; args: { taskId: string; userId: string } }
  | {
      type: 'bulk_reschedule';
      args: {
        items: {
          taskId: string;
          newDate?: string;
          newTime?: string;
          clearDate?: boolean;
          clearTime?: boolean;
        }[];
        reason?: string;
      };
    }
  | {
      type: 'create_calendar_event';
      args: {
        title: string;
        description?: string;
        date: string;
        time?: string;
        durationMinutes?: number;
        allDay?: boolean;
      };
    }
  | { type: 'delete_calendar_event'; args: { eventId: string } }
  | { type: 'clear_calendar_day'; args: { date: string } };

export type ChatContextExtras = {
  members?: { userId: string; name: string; email?: string | null }[];
  calendarEvents?: { id: string; title: string; date?: string | null; time?: string | null; durationMinutes?: number | null }[];
};

export async function chatWithAssistant(opts: {
  messages: { role: 'user' | 'assistant'; content: string }[];
  tasks: Task[];
  projects: Project[];
  extras?: ChatContextExtras;
}) {
  const ctx = buildContext(opts.tasks, opts.projects);
  const taskCatalog = opts.tasks
    .filter((t) => !t.parentId)
    .slice(0, 200)
    .map((t) => ({
      id: t.id,
      title: t.title,
      date: t.dueDate ?? null,
      time: t.dueTime ?? null,
      priority: t.priority,
      project: opts.projects.find((p) => p.id === t.projectId)?.name ?? null,
      completed: t.completed,
      assignees: t.assigneeIds ?? [],
    }));
  const projectCatalog = opts.projects.map((p) => ({ id: p.id, name: p.name, isInbox: !!(p as any).isInbox }));
  const memberCatalog = opts.extras?.members ?? [];
  const calendarEvents = opts.extras?.calendarEvents ?? [];

  return invoke<{ text: string; actions?: AssistantAction[] }>({
    action: 'chat',
    messages: opts.messages,
    taskCatalog,
    projectCatalog,
    memberCatalog,
    calendarEvents,
    ...ctx,
  });
}
