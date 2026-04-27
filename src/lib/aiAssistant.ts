// Cliente para a edge function ai-assistant.
// Constrói o "contexto" (tarefas agendadas, eventos do GCal, feriados, perfil)
// e envia ao backend.

import { supabase } from '@/integrations/supabase/client';
import type { Task, Project } from '@/types/task';
import { getBrazilianHolidays } from '@/lib/holidays';
import { format, addDays, subHours } from 'date-fns';

type ScheduledTaskCtx = {
  id?: string;
  title: string;
  date: string;
  time?: string | null;
  durationMinutes?: number | null;
  priority?: number;
  project?: string;
  labels?: string[];
};

type CalendarEventCtx = {
  id?: string;
  title: string;
  start: string;
  end: string;
  calendar?: string;
};

function brIso(d: Date): string {
  // ISO com offset -03:00 (America/Sao_Paulo, simplificado)
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}-03:00`;
}

async function getUserProfile() {
  try {
    const { data } = await supabase
      .from('user_settings')
      .select('work_start, work_end, focus_blocks, energy_pattern')
      .maybeSingle();
    if (!data) return undefined;
    return {
      workStart: (data as any).work_start ?? '09:00',
      workEnd: (data as any).work_end ?? '19:00',
      focusBlocks: (data as any).focus_blocks ?? [],
      energyPattern: (data as any).energy_pattern ?? 'manha',
      timezone: 'America/Sao_Paulo',
    };
  } catch {
    return undefined;
  }
}

async function getCalendarEvents(fromDate: string, toDate: string): Promise<CalendarEventCtx[]> {
  try {
    const { data } = await supabase
      .from('calendar_events' as any)
      .select('id, title, start_time, end_time, calendar_id')
      .gte('start_time', `${fromDate}T00:00:00`)
      .lte('start_time', `${toDate}T23:59:59`)
      .limit(100);
    if (!Array.isArray(data)) return [];
    return data.map((e: any) => ({
      id: e.id,
      title: e.title,
      start: e.start_time,
      end: e.end_time,
      calendar: e.calendar_id,
    }));
  } catch {
    return [];
  }
}

async function buildContext(tasks: Task[], projects: Project[], targetDate?: string) {
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const nowTime = format(now, 'HH:mm');
  const nowIso = brIso(now);
  const horizonEnd = format(addDays(now, 14), 'yyyy-MM-dd');
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
      id: t.id,
      title: t.title,
      date: t.dueDate!,
      time: t.dueTime ?? null,
      durationMinutes: t.durationMinutes ?? null,
      priority: t.priority,
      project: projectName(t.projectId),
      labels: (t as any).labels ?? [],
    }));

  const yearNow = now.getFullYear();
  const holidays = [
    ...getBrazilianHolidays(yearNow),
    ...getBrazilianHolidays(yearNow + 1),
  ].filter((h) => h.date >= today && h.date <= horizonEnd);

  const cutoff = subHours(now, 48);
  const recentlyCompleted = tasks
    .filter((t) => t.completed && (t as any).completedAt && new Date((t as any).completedAt) >= cutoff)
    .slice(0, 30)
    .map((t) => ({
      title: t.title,
      completedAt: (t as any).completedAt,
      priority: t.priority,
    }));

  const events = await getCalendarEvents(today, horizonEnd);
  const userProfile = await getUserProfile();

  return {
    today,
    nowTime,
    nowIso,
    targetDate: targetDate ?? today,
    scheduled,
    events,
    holidays,
    recentlyCompleted,
    userProfile,
  };
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ai-assistant', { body });
  if (error) {
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
  const ctx = await buildContext(opts.tasks, opts.projects);
  return invoke<{
    date: string;
    time: string;
    durationMinutes: number;
    inferredPriority?: number;
    reason: string;
    alternatives?: { date: string; time: string; durationMinutes: number; reason: string }[];
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
    labels?: string[];
    deadline?: string | null;
  }[];
  tasks: Task[];
  projects: Project[];
}) {
  const ctx = await buildContext(opts.tasks, opts.projects, opts.date);
  return invoke<{
    assignments: {
      id: string;
      date: string;
      time: string;
      durationMinutes: number;
      rationale?: string;
      confidence?: 'alta' | 'media' | 'baixa';
    }[];
    unscheduledOut?: { id: string; reason: string }[];
    summary: string;
    requiresConfirmation?: boolean;
  }>({
    action: 'organize-day',
    date: opts.date,
    targetDate: opts.date,
    unscheduled: opts.unscheduled,
    ...ctx,
  });
}

type AnalyzeStruct = {
  workloadScore: number;
  workloadLabel: string;
  topPriorities?: { taskId: string; why: string }[];
  conflicts?: { type: string; description: string; taskIds?: string[] }[];
  risks?: string[];
  recommendations?: { action: string; rationale: string; taskIds?: string[] }[];
  focusBlock?: { start: string; end: string; durationMin: number } | null;
  summary: string;
};

function analyzeToMarkdown(a: AnalyzeStruct): string {
  const lines: string[] = [];
  lines.push(`### 📊 Resumo`);
  lines.push(`**${a.workloadLabel.toUpperCase()}** · carga ${a.workloadScore}/10`);
  lines.push('');
  lines.push(`> ${a.summary}`);
  if (a.topPriorities?.length) {
    lines.push('');
    lines.push('### 🎯 Prioridades');
    a.topPriorities.forEach((p) => lines.push(`- ${p.why}`));
  }
  if (a.conflicts?.length) {
    lines.push('');
    lines.push('### ⚠️ Conflitos');
    a.conflicts.forEach((c) => lines.push(`- **${c.type}** — ${c.description}`));
  }
  if (a.risks?.length) {
    lines.push('');
    lines.push('### 🔥 Riscos');
    a.risks.forEach((r) => lines.push(`- ${r}`));
  }
  if (a.recommendations?.length) {
    lines.push('');
    lines.push('### ✅ Recomendações');
    a.recommendations.forEach((r) => lines.push(`- **${r.action}** — ${r.rationale}`));
  }
  if (a.focusBlock) {
    lines.push('');
    lines.push(`### 🧠 Bloco de foco sugerido`);
    lines.push(`${a.focusBlock.start}–${a.focusBlock.end} (${a.focusBlock.durationMin}min)`);
  }
  return lines.join('\n');
}

export async function analyzeDay(opts: {
  date: string;
  tasks: Task[];
  projects: Project[];
}) {
  const ctx = await buildContext(opts.tasks, opts.projects, opts.date);
  const struct = await invoke<AnalyzeStruct>({
    action: 'analyze-day',
    date: opts.date,
    targetDate: opts.date,
    ...ctx,
  });
  return { text: analyzeToMarkdown(struct), raw: struct };
}

export async function chatWithAssistant(opts: {
  messages: { role: 'user' | 'assistant'; content: string }[];
  tasks: Task[];
  projects: Project[];
}) {
  const ctx = await buildContext(opts.tasks, opts.projects);
  return invoke<{ text: string }>({
    action: 'chat',
    messages: opts.messages,
    ...ctx,
  });
}
