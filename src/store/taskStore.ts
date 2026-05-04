import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { Task, Project, Label, ViewFilter, Priority, RecurrenceType } from '@/types/task';
import { useUndoStore } from '@/store/undoStore';
import { expandOccurrencesInRange } from '@/lib/recurrence';

interface TaskState {
  tasks: Task[];
  projects: Project[];
  labels: Label[];
  activeView: ViewFilter;
  activeProjectId: string | null;
  activeLabelId: string | null;
  sidebarOpen: boolean;
  loading: boolean;

  fetchData: () => Promise<void>;

  addTask: (
    task: Omit<Task, 'id' | 'createdAt' | 'completed' | 'completedAt' | 'labels'> & {
      labels?: string[];
      reminderMinutes?: number | null;
      assigneeIds?: string[];
    },
    options?: { skipUndo?: boolean }
  ) => Promise<Task | null>;
  updateTask: (id: string, updates: Partial<Task>, options?: { skipUndo?: boolean }) => Promise<void>;
  deleteTask: (id: string, options?: { skipUndo?: boolean }) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;

  addProject: (project: Omit<Project, 'id'>) => Promise<Project | null>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  toggleProjectFavorite: (id: string) => Promise<void>;

  addLabel: (label: Omit<Label, 'id'>) => Promise<void>;
  deleteLabel: (id: string) => Promise<void>;
  toggleLabelFavorite: (id: string) => Promise<void>;

  setActiveView: (view: ViewFilter) => void;
  setActiveProjectId: (id: string | null) => void;
  setActiveLabelId: (id: string | null) => void;
  toggleSidebar: () => void;
}

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: {
    date?: string;
    dateTime?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
  };
}

const GOOGLE_CALENDAR_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar`;
const GOOGLE_SYNC_PAUSED_KEY = 'taskflow_google_sync_paused';
const GOOGLE_SYNC_SAFETY_KEY = 'taskflow_google_sync_safety_v2';

function isGoogleSyncPaused() {
  if (typeof window === 'undefined') return true;
  if (localStorage.getItem(GOOGLE_SYNC_SAFETY_KEY) !== 'acknowledged') {
    localStorage.setItem(GOOGLE_SYNC_PAUSED_KEY, 'true');
    return true;
  }
  return localStorage.getItem(GOOGLE_SYNC_PAUSED_KEY) !== 'false';
}

function mapDbTaskToTask(t: any): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description || undefined,
    completed: t.completed,
    completedAt: t.completed_at || undefined,
    priority: t.priority as Priority,
    dueDate: t.due_date || undefined,
    dueTime: t.due_time ? t.due_time.slice(0, 5) : undefined,
    durationMinutes: t.duration_minutes ?? null,
    dueString: t.due_string || null,
    deadline: t.deadline || null,
    recurrenceRule: t.recurrence_rule || null,
    projectId: t.project_id || undefined,
    sectionId: t.section_id || null,
    parentId: t.parent_id || undefined,
    labels: (t.task_labels || []).map((tl: any) => tl.label_id),
    recurrence: t.recurrence_type
      ? { type: t.recurrence_type as RecurrenceType, interval: t.recurrence_interval || 1 }
      : undefined,
    googleCalendarEventId: t.google_calendar_event_id || undefined,
    taskNumber: t.task_number ?? null,
    assigneeIds: (t.task_assignees || []).map((a: any) => a.user_id),
    createdAt: t.created_at,
  };
}

function getCalendarDateAndTime(event: GoogleCalendarEvent): {
  dueDate?: string;
  dueTime?: string;
  durationMinutes?: number | null;
} {
  if (event.start?.dateTime) {
    const [date, timeWithOffset] = event.start.dateTime.split('T');
    const dueTime = timeWithOffset?.slice(0, 5);
    const start = new Date(event.start.dateTime);
    const end = event.end?.dateTime ? new Date(event.end.dateTime) : null;
    const durationMinutes =
      end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())
        ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000))
        : null;
    return { dueDate: date, dueTime, durationMinutes };
  }
  if (event.start?.date) {
    return { dueDate: event.start.date, durationMinutes: null };
  }
  return {};
}

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function getGoogleAccessToken(): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData.session?.access_token ?? null;
}

function getTaskEndTime(task: Pick<Task, 'dueTime' | 'durationMinutes'>): string | undefined {
  if (!task.dueTime) return undefined;
  const [h, m] = task.dueTime.split(':').map(Number);
  const duration = task.durationMinutes ?? 60;
  const endDate = new Date(2000, 0, 1, h, m + duration);
  return `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
}

function normalizeCalendarTitle(value?: string | null) {
  return (value || '').replace(/^✅\s*/, '').trim().toLowerCase();
}

function getTaskDuplicateKey(task: Pick<Task, 'title' | 'dueDate' | 'dueTime' | 'completed'>): string | null {
  if (task.completed || !task.dueDate) return null;
  return [normalizeCalendarTitle(task.title), task.dueDate, task.dueTime ?? 'all-day'].join('|');
}

function getCalendarEventDuplicateKey(event: GoogleCalendarEvent): string | null {
  const parsed = getCalendarDateAndTime(event);
  if (!parsed.dueDate) return null;
  return [normalizeCalendarTitle(event.summary), parsed.dueDate, parsed.dueTime ?? 'all-day'].join('|');
}

function isSameCalendarSlot(task: Task, event: GoogleCalendarEvent) {
  const parsed = getCalendarDateAndTime(event);
  return (
    !task.completed &&
    normalizeCalendarTitle(task.title) === normalizeCalendarTitle(event.summary) &&
    task.dueDate === parsed.dueDate &&
    (task.dueTime ?? null) === (parsed.dueTime ?? null)
  );
}

function rangesOverlap(startA?: string | null, durationA?: number | null, startB?: string | null, durationB?: number | null) {
  if (!startA || !startB) return false;
  const toMin = (value: string) => {
    const [h, m] = value.slice(0, 5).split(':').map(Number);
    return h * 60 + m;
  };
  const aStart = toMin(startA);
  const bStart = toMin(startB);
  const aEnd = aStart + (durationA ?? 60);
  const bEnd = bStart + (durationB ?? 60);
  return aStart < bEnd && bStart < aEnd;
}

function taskMatchesCalendarEvent(task: Task, event: GoogleCalendarEvent) {
  const parsed = getCalendarDateAndTime(event);
  return (
    !task.completed &&
    normalizeCalendarTitle(task.title) === normalizeCalendarTitle(event.summary) &&
    task.dueDate === parsed.dueDate &&
    (task.dueTime ?? null) === (parsed.dueTime ?? null)
  );
}

function recurrenceCoversCalendarEvent(task: Task, event: GoogleCalendarEvent) {
  const parsed = getCalendarDateAndTime(event);
  if (!task.recurrenceRule || !parsed.dueDate || !task.dueDate) return false;
  const day = new Date(`${parsed.dueDate}T12:00:00`);
  const occurrences = expandOccurrencesInRange(
    task.recurrenceRule,
    task.dueDate,
    task.dueTime,
    day,
    day
  );
  return (
    !task.completed &&
    occurrences.includes(parsed.dueDate) &&
    normalizeCalendarTitle(task.title) === normalizeCalendarTitle(event.summary) &&
    rangesOverlap(task.dueTime, task.durationMinutes, parsed.dueTime, parsed.durationMinutes)
  );
}

function recurrenceCoversTask(series: Task, occurrence: Task) {
  if (!series.recurrenceRule || !series.dueDate || !occurrence.dueDate) return false;
  const day = new Date(`${occurrence.dueDate}T12:00:00`);
  const occurrences = expandOccurrencesInRange(
    series.recurrenceRule,
    series.dueDate,
    series.dueTime,
    day,
    day
  );
  return (
    series.id !== occurrence.id &&
    !series.completed &&
    !occurrence.completed &&
    !!occurrence.googleCalendarEventId &&
    occurrences.includes(occurrence.dueDate) &&
    normalizeCalendarTitle(series.title) === normalizeCalendarTitle(occurrence.title) &&
    rangesOverlap(series.dueTime, series.durationMinutes, occurrence.dueTime, occurrence.durationMinutes)
  );
}

async function cleanupLocalCalendarDuplicates(tasks: Task[]): Promise<Task[]> {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = getTaskDuplicateKey(task);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }

  const duplicateIds = new Set<string>();
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    group.sort((a, b) => {
      if (!!a.googleCalendarEventId !== !!b.googleCalendarEventId) return a.googleCalendarEventId ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
    group.slice(1).forEach((task) => duplicateIds.add(task.id));
  }

  if (duplicateIds.size > 0) {
    await supabase.from('tasks').delete().in('id', Array.from(duplicateIds));
  }

  return tasks.filter((task) => !duplicateIds.has(task.id));
}

async function createGoogleCalendarEvent(task: Task): Promise<string | null> {
  if (isGoogleSyncPaused()) return null;
  if (!task.dueDate) return null;
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) return null;
  const response = await fetch(`${GOOGLE_CALENDAR_FUNCTION_URL}?action=create-event`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: task.title,
      description: task.description ?? '',
      date: task.dueDate,
      time: task.dueTime,
      endTime: getTaskEndTime(task),
      allDay: !task.dueTime,
      durationMinutes: task.durationMinutes ?? 60,
      taskId: task.id,
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  if (payload?.error) return null;
  return typeof payload?.id === 'string' ? payload.id : null;
}

async function updateGoogleCalendarEvent(task: Task): Promise<void> {
  if (isGoogleSyncPaused()) return;
  if (!task.googleCalendarEventId || !task.dueDate) return;
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) return;
  await fetch(`${GOOGLE_CALENDAR_FUNCTION_URL}?action=update-event`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      eventId: task.googleCalendarEventId,
      title: task.title,
      description: task.description ?? '',
      date: task.dueDate,
      time: task.dueTime || undefined,
      endTime: getTaskEndTime(task),
      allDay: !task.dueTime,
      durationMinutes: task.durationMinutes ?? 60,
    }),
  });
}

async function deleteGoogleCalendarEvent(eventId?: string | null): Promise<void> {
  if (isGoogleSyncPaused()) return;
  if (!eventId) return;
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) return;
  await fetch(`${GOOGLE_CALENDAR_FUNCTION_URL}?action=delete-event&eventId=${encodeURIComponent(eventId)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });
}

async function syncGoogleCalendarEvents(
  userId: string,
  currentTasks: Task[],
  inboxProjectId?: string
): Promise<Task[]> {
  if (isGoogleSyncPaused()) return currentTasks;

  const { data: tokenRows, error: tokenError } = await supabase
    .from('google_tokens')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (tokenError || !tokenRows?.length) return currentTasks;

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return currentTasks;

  // Janela ampla: 30 dias para trás até 180 dias para frente
  const startOfRange = new Date();
  startOfRange.setDate(startOfRange.getDate() - 30);
  startOfRange.setHours(0, 0, 0, 0);
  const endOfRange = new Date();
  endOfRange.setDate(endOfRange.getDate() + 180);
  endOfRange.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    action: 'list-events',
    timeMin: startOfRange.toISOString(),
    timeMax: endOfRange.toISOString(),
  });

  try {
    const response = await fetch(`${GOOGLE_CALENDAR_FUNCTION_URL}?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return currentTasks;
    const payload = await response.json();
    const events: GoogleCalendarEvent[] = Array.isArray(payload?.items) ? payload.items : [];
    if (events.length === 0) return currentTasks;

    let nextTasks = [...currentTasks];
    const tasksToInsert: Record<string, any>[] = [];
    const occupiedTaskKeys = new Set(
      nextTasks.map((task) => getTaskDuplicateKey(task)).filter((key): key is string => Boolean(key))
    );
    const seenCalendarKeys = new Set<string>();
    const seenEventIds = new Set<string>();

    for (const event of events) {
      if (!event.id) continue;
      seenEventIds.add(event.id);
      const { dueDate, dueTime, durationMinutes } = getCalendarDateAndTime(event);
      const eventKey = getCalendarEventDuplicateKey(event);
      if (!eventKey || seenCalendarKeys.has(eventKey)) continue;
      seenCalendarKeys.add(eventKey);
      const payload = {
        title: event.summary?.trim() || 'Evento do Google Calendar',
        description: event.description || null,
        due_date: dueDate || null,
        due_time: dueTime ? `${dueTime}:00` : null,
        duration_minutes: durationMinutes,
        google_calendar_event_id: event.id,
      };

      const linkedTask = nextTasks.find((task) => task.googleCalendarEventId === event.id);
      if (linkedTask) {
        const collisionTask = nextTasks.find((task) => task.id !== linkedTask.id && isSameCalendarSlot(task, event));
        if (collisionTask) {
          if (!collisionTask.googleCalendarEventId) {
            await supabase.from('tasks').update({ google_calendar_event_id: event.id }).eq('id', collisionTask.id);
          }
          await supabase.from('tasks').delete().eq('id', linkedTask.id);
          nextTasks = nextTasks
            .filter((task) => task.id !== linkedTask.id)
            .map((task) => (task.id === collisionTask.id ? { ...task, googleCalendarEventId: event.id } : task));
          continue;
        }

        const { error: updateError } = await supabase.from('tasks').update(payload).eq('id', linkedTask.id);
        if (updateError) continue;
        nextTasks = nextTasks.map((task) =>
          task.id === linkedTask.id ? mapDbTaskToTask({ ...payload, id: task.id, user_id: userId, completed: task.completed, completed_at: task.completedAt, priority: task.priority, project_id: task.projectId, section_id: task.sectionId, parent_id: task.parentId, recurrence_type: null, recurrence_interval: 1, due_string: task.dueString, deadline: task.deadline, recurrence_rule: task.recurrenceRule, created_at: task.createdAt, task_labels: task.labels.map((label_id) => ({ label_id })) }) : task
        );
        continue;
      }

      if (nextTasks.some((task) => recurrenceCoversCalendarEvent(task, event))) {
        continue;
      }

      const duplicateTask = nextTasks.find((task) => isSameCalendarSlot(task, event));
      if (duplicateTask) {
        if (!duplicateTask.googleCalendarEventId) {
          const { error: linkError } = await supabase.from('tasks').update({ google_calendar_event_id: event.id }).eq('id', duplicateTask.id);
          if (linkError) continue;
          nextTasks = nextTasks.map((task) =>
            task.id === duplicateTask.id ? { ...task, googleCalendarEventId: event.id } : task
          );
        }
        continue;
      }

      if (occupiedTaskKeys.has(eventKey)) continue;
      occupiedTaskKeys.add(eventKey);

      tasksToInsert.push({
        user_id: userId,
        ...payload,
        priority: 4,
        project_id: inboxProjectId || null,
      });
    }

    let resultTasks = nextTasks;
    if (tasksToInsert.length > 0) {
      const { data: insertedRows, error: insertError } = await supabase
        .from('tasks')
        .insert(tasksToInsert as any)
        .select('*, task_labels(label_id), task_assignees(user_id)');

      if (insertError || !insertedRows) return currentTasks;
      const syncedTasks = insertedRows.map(mapDbTaskToTask);
      resultTasks = [...syncedTasks, ...nextTasks];
    }

    return resultTasks;
  } catch (error) {
    console.error('Falha na sincronização com Google Calendar:', error);
    return currentTasks;
  }
}

export const useTaskStore = create<TaskState>()((set, get) => ({
  tasks: [],
  projects: [],
  labels: [],
  activeView: 'today',
  activeProjectId: null,
  activeLabelId: null,
  sidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  loading: true,

  fetchData: async () => {
    const userId = await getUserId();
    if (!userId) return;

    const [projectsRes, labelsRes, tasksRes] = await Promise.all([
      // RLS já restringe ao que o usuário pode ver (próprios + workspace/team/projetos compartilhados).
      // NÃO filtrar por user_id aqui — isso excluiria projetos compartilhados.
      supabase.from('projects').select('*').order('position'),
      supabase.from('labels').select('*').eq('user_id', userId),
      supabase.from('tasks').select('*, task_labels(label_id), task_assignees(user_id)'),
    ]);

    const projects: Project[] = (projectsRes.data || [])
      .filter((p: any) => !p.archived_at)
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isInbox: p.is_inbox,
        parentId: p.parent_id || null,
        isFavorite: !!p.is_favorite,
        viewType: (p.view_type as 'list' | 'board') || 'list',
        description: p.description || null,
        archivedAt: p.archived_at || null,
        position: p.position ?? 0,
        workspaceId: p.workspace_id || null,
        ownerId: p.owner_id || null,
        teamId: p.team_id || null,
        visibility: (p.visibility as 'private' | 'team' | 'workspace') || 'private',
      }));

    const labels: Label[] = (labelsRes.data || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      isFavorite: !!l.is_favorite,
    }));

    const tasks: Task[] = await cleanupLocalCalendarDuplicates((tasksRes.data || []).map(mapDbTaskToTask));
    const inboxProjectId = projects.find((p) => p.isInbox)?.id;

    const syncedTasks = await syncGoogleCalendarEvents(userId, tasks, inboxProjectId);

    set({ projects, labels, tasks: syncedTasks, loading: false });
  },

  addTask: async (taskData, options) => {
    const userId = await getUserId();
    if (!userId) return null;

    const inboxProject = get().projects.find((p) => p.isInbox);
    const targetProjectId = taskData.projectId || inboxProject?.id || null;
    const targetProject = targetProjectId
      ? get().projects.find((p) => p.id === targetProjectId)
      : null;
    // Resolve workspace from target project (every project now has workspace_id)
    let workspaceId: string | null = (targetProject as any)?.workspaceId ?? null;
    if (!workspaceId && targetProjectId) {
      const { data: proj } = await supabase
        .from('projects')
        .select('workspace_id')
        .eq('id', targetProjectId)
        .maybeSingle();
      workspaceId = proj?.workspace_id ?? null;
    }
    if (!workspaceId) {
      // Fallback: user's personal workspace
      const { data: ws } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', userId)
        .eq('is_personal', true)
        .maybeSingle();
      workspaceId = ws?.id ?? null;
    }

    const insertPayload: Record<string, any> = {
      user_id: userId,
      workspace_id: workspaceId,
      created_by: userId,
      title: taskData.title,
      description: taskData.description || null,
      priority: taskData.priority || 4,
      due_date: taskData.dueDate || null,
      due_time: taskData.dueTime ? `${taskData.dueTime}:00` : null,
      duration_minutes: taskData.durationMinutes ?? null,
      due_string: taskData.dueString || null,
      deadline: taskData.deadline || null,
      recurrence_rule: taskData.recurrenceRule || null,
      google_calendar_event_id: taskData.googleCalendarEventId || null,
      project_id: targetProjectId,
      section_id: taskData.sectionId || null,
      parent_id: taskData.parentId || null,
    };

    const { data, error } = await supabase
      .from('tasks')
      .insert(insertPayload as any)
      .select()
      .single();

    if (error || !data) {
      console.error('addTask error', error);
      return null;
    }

    const labelIds = taskData.labels || [];
    if (labelIds.length > 0) {
      await supabase.from('task_labels').insert(
        labelIds.map((labelId) => ({ task_id: data.id, label_id: labelId }))
      );
    }

    // Assignees: trigger inicial já adiciona o owner; aqui adicionamos os extras
    const assigneeIds = (taskData.assigneeIds || []).filter((id) => id && id !== userId);
    if (assigneeIds.length > 0) {
      await supabase.from('task_assignees').insert(
        assigneeIds.map((uid) => ({ task_id: data.id, user_id: uid, assigned_by: userId }))
      );
    }

    // Reminders: cria um registro por antecedência configurada (ex.: [1440, 15] = 1 dia e 15 min antes).
    if (data.due_date && data.due_time) {
      let offsets: number[] = [];
      const explicit = taskData.reminderMinutes;
      if (explicit != null) {
        offsets = [explicit];
      } else {
        const { data: settings } = await supabase
          .from('user_settings')
          .select('default_reminder_minutes, reminder_offsets_minutes')
          .eq('user_id', userId)
          .maybeSingle();
        const fromArray = Array.isArray((settings as any)?.reminder_offsets_minutes)
          ? ((settings as any).reminder_offsets_minutes as number[])
          : null;
        offsets = fromArray && fromArray.length > 0
          ? fromArray
          : [settings?.default_reminder_minutes ?? 15];
      }
      const dueAt = new Date(`${data.due_date}T${data.due_time}`);
      const rows = offsets
        .filter((m) => typeof m === 'number' && m >= 0)
        .map((m) => {
          const t = new Date(dueAt.getTime() - m * 60_000);
          return t.getTime() > Date.now()
            ? {
                task_id: data.id,
                trigger_at: t.toISOString(),
                type: 'absolute',
                relative_minutes: m,
                channel: 'push',
              }
            : null;
        })
        .filter(Boolean);
      if (rows.length > 0) {
        await supabase.from('reminders').insert(rows as any);
      }
    }

    const allAssignees = Array.from(new Set([userId, ...(taskData.assigneeIds || [])])).filter(Boolean) as string[];
    const newTask: Task = mapDbTaskToTask({
      ...data,
      task_labels: labelIds.map((id) => ({ label_id: id })),
      task_assignees: allAssignees.map((uid) => ({ user_id: uid })),
    });
    set((state) => ({ tasks: [newTask, ...state.tasks] }));

    if (newTask.dueDate && !newTask.completed) {
      try {
        if (newTask.googleCalendarEventId) {
          await updateGoogleCalendarEvent(newTask);
        } else {
          const googleCalendarEventId = await createGoogleCalendarEvent(newTask);
          if (googleCalendarEventId) {
          await supabase
            .from('tasks')
            .update({ google_calendar_event_id: googleCalendarEventId })
            .eq('id', newTask.id);
          newTask.googleCalendarEventId = googleCalendarEventId;
          set((state) => ({
            tasks: state.tasks.map((t) =>
              t.id === newTask.id ? { ...t, googleCalendarEventId } : t
            ),
          }));
          }
        }
      } catch (error) {
        console.error('Falha ao criar evento no Google Calendar:', error);
      }
    }

    if (!options?.skipUndo) {
      useUndoStore.getState().push({
        label: `Criar "${newTask.title}"`,
        undo: async () => {
          await deleteGoogleCalendarEvent(newTask.googleCalendarEventId);
          await supabase.from('tasks').delete().eq('id', newTask.id);
          set((state) => ({ tasks: state.tasks.filter((t) => t.id !== newTask.id) }));
        },
      });
    }

    return newTask;
  },

  updateTask: async (id, updates, options) => {
    const existing = get().tasks.find((t) => t.id === id);

    const dbUpdates: Record<string, any> = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
    if (updates.dueTime !== undefined) dbUpdates.due_time = updates.dueTime ? `${updates.dueTime}:00` : null;
    if (updates.durationMinutes !== undefined) dbUpdates.duration_minutes = updates.durationMinutes;
    if (updates.dueString !== undefined) dbUpdates.due_string = updates.dueString;
    if (updates.deadline !== undefined) dbUpdates.deadline = updates.deadline;
    if (updates.recurrenceRule !== undefined) dbUpdates.recurrence_rule = updates.recurrenceRule;
    if ('googleCalendarEventId' in updates) dbUpdates.google_calendar_event_id = updates.googleCalendarEventId ?? null;
    if (updates.projectId !== undefined) dbUpdates.project_id = updates.projectId;
    if (updates.sectionId !== undefined) dbUpdates.section_id = updates.sectionId;
    if (updates.completed !== undefined) {
      dbUpdates.completed = updates.completed;
      dbUpdates.completed_at = updates.completed ? new Date().toISOString() : null;
    }

    if (Object.keys(dbUpdates).length > 0) {
      const { error } = await supabase.from('tasks').update(dbUpdates).eq('id', id);
      if (error) {
        console.error('updateTask error', error);
        return;
      }
    }

    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));

    // Registra undo restaurando campos anteriores
    if (existing && !options?.skipUndo) {
      const prevFields: Partial<Task> = {};
      const prevDb: Record<string, any> = {};
      const keys = Object.keys(updates) as (keyof Task)[];
      for (const k of keys) {
        (prevFields as any)[k] = (existing as any)[k];
      }
      if (updates.title !== undefined) prevDb.title = existing.title;
      if (updates.description !== undefined) prevDb.description = existing.description ?? null;
      if (updates.priority !== undefined) prevDb.priority = existing.priority;
      if (updates.dueDate !== undefined) prevDb.due_date = existing.dueDate ?? null;
      if (updates.dueTime !== undefined) prevDb.due_time = existing.dueTime ? `${existing.dueTime}:00` : null;
      if (updates.durationMinutes !== undefined) prevDb.duration_minutes = existing.durationMinutes ?? null;
      if (updates.dueString !== undefined) prevDb.due_string = existing.dueString ?? null;
      if (updates.deadline !== undefined) prevDb.deadline = existing.deadline ?? null;
      if (updates.recurrenceRule !== undefined) prevDb.recurrence_rule = existing.recurrenceRule ?? null;
      if (updates.projectId !== undefined) prevDb.project_id = existing.projectId ?? null;
      if (updates.sectionId !== undefined) prevDb.section_id = existing.sectionId ?? null;
      if (updates.completed !== undefined) {
        prevDb.completed = existing.completed;
        prevDb.completed_at = existing.completedAt ?? null;
      }

      useUndoStore.getState().push({
        label: `Editar "${existing.title}"`,
        undo: async () => {
          if (Object.keys(prevDb).length > 0) {
            await supabase.from('tasks').update(prevDb).eq('id', id);
          }
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...prevFields } : t)),
          }));
        },
      });
    }

    const merged = existing ? ({ ...existing, ...updates } as Task) : null;
    const touchesCalendar =
      updates.title !== undefined ||
      updates.description !== undefined ||
      updates.dueDate !== undefined ||
      updates.dueTime !== undefined ||
      updates.durationMinutes !== undefined;

    if (existing && merged && touchesCalendar) {
      try {
        if (merged.dueDate && existing.googleCalendarEventId) {
          await updateGoogleCalendarEvent(merged);
        } else if (merged.dueDate && !existing.googleCalendarEventId && !merged.completed) {
          const googleCalendarEventId = await createGoogleCalendarEvent(merged);
          if (googleCalendarEventId) {
            await supabase.from('tasks').update({ google_calendar_event_id: googleCalendarEventId }).eq('id', id);
            set((state) => ({
              tasks: state.tasks.map((t) => (t.id === id ? { ...t, googleCalendarEventId } : t)),
            }));
          }
        } else if (!merged.dueDate && existing.googleCalendarEventId) {
          await deleteGoogleCalendarEvent(existing.googleCalendarEventId);
          await supabase.from('tasks').update({ google_calendar_event_id: null }).eq('id', id);
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === id ? { ...t, googleCalendarEventId: undefined } : t)),
          }));
        }
      } catch (error) {
        console.error('Falha ao sincronizar atualização com Google Calendar:', error);
      }
    }

    // Re-sincroniza lembrete quando data/hora mudam ou quando a tarefa é (re)agendada
    const reminderTouched =
      updates.dueDate !== undefined || updates.dueTime !== undefined || updates.completed !== undefined;
    if (existing && merged && reminderTouched) {
      try {
        // Remove reminders ainda não disparados desta tarefa
        await supabase.from('reminders').delete().eq('task_id', id).is('fired_at', null);

        if (merged.dueDate && merged.dueTime && !merged.completed) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: settings } = await supabase
              .from('user_settings')
              .select('default_reminder_minutes, reminder_offsets_minutes')
              .eq('user_id', user.id)
              .maybeSingle();
            const fromArray = Array.isArray((settings as any)?.reminder_offsets_minutes)
              ? ((settings as any).reminder_offsets_minutes as number[])
              : null;
            const offsets = fromArray && fromArray.length > 0
              ? fromArray
              : [settings?.default_reminder_minutes ?? 15];
            const dueAt = new Date(`${merged.dueDate}T${merged.dueTime}:00`);
            const rows = offsets
              .filter((m) => typeof m === 'number' && m >= 0)
              .map((m) => {
                const t = new Date(dueAt.getTime() - m * 60_000);
                return t.getTime() > Date.now()
                  ? {
                      task_id: id,
                      trigger_at: t.toISOString(),
                      type: 'absolute',
                      relative_minutes: m,
                      channel: 'push',
                    }
                  : null;
              })
              .filter(Boolean);
            if (rows.length > 0) {
              await supabase.from('reminders').insert(rows as any);
            }
          }
        }
      } catch (e) {
        console.error('Falha ao re-sincronizar lembrete:', e);
      }
    }
  },

  deleteTask: async (id, options) => {
    const task = get().tasks.find((t) => t.id === id);
    const children = get().tasks.filter((t) => t.parentId === id);

    await supabase.from('tasks').delete().eq('id', id);
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id && t.parentId !== id),
    }));

    if (task?.googleCalendarEventId) {
      await deleteGoogleCalendarEvent(task.googleCalendarEventId).catch((error) => {
        console.error('Falha ao remover evento do Google Calendar:', error);
      });
    }

    if (task && !options?.skipUndo) {
      const userId = await getUserId();
      const snapshot = { ...task };
      const childrenSnap = children.map((c) => ({ ...c }));
      useUndoStore.getState().push({
        label: `Excluir "${task.title}"`,
        undo: async () => {
          if (!userId) return;
          const buildPayload = (t: Task) => ({
            id: t.id,
            user_id: userId,
            title: t.title,
            description: t.description ?? null,
            priority: t.priority,
            due_date: t.dueDate ?? null,
            due_time: t.dueTime ? `${t.dueTime}:00` : null,
            duration_minutes: t.durationMinutes ?? null,
            due_string: t.dueString ?? null,
            deadline: t.deadline ?? null,
            recurrence_rule: t.recurrenceRule ?? null,
            project_id: t.projectId ?? null,
            section_id: t.sectionId ?? null,
            parent_id: t.parentId ?? null,
            completed: t.completed,
            completed_at: t.completedAt ?? null,
          });
          await supabase.from('tasks').insert([buildPayload(snapshot), ...childrenSnap.map(buildPayload)] as any);
          if (snapshot.labels.length > 0) {
            await supabase.from('task_labels').insert(
              snapshot.labels.map((labelId) => ({ task_id: snapshot.id, label_id: labelId }))
            );
          }
          set((state) => ({ tasks: [snapshot, ...childrenSnap, ...state.tasks] }));
        },
      });
    }
  },

  toggleTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;

    const prevCompleted = task.completed;
    const prevCompletedAt = task.completedAt;
    const completed = !task.completed;
    const completedAt = completed ? new Date().toISOString() : null;

    await supabase
      .from('tasks')
      .update({ completed, completed_at: completedAt })
      .eq('id', id);

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, completed, completedAt: completedAt || undefined } : t
      ),
    }));

    useUndoStore.getState().push({
      label: completed ? `Desmarcar "${task.title}"` : `Marcar "${task.title}"`,
      undo: async () => {
        await supabase
          .from('tasks')
          .update({ completed: prevCompleted, completed_at: prevCompletedAt ?? null })
          .eq('id', id);
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, completed: prevCompleted, completedAt: prevCompletedAt } : t
          ),
        }));
      },
    });

    // Notify FleetDesk (fire-and-forget) so corrective tickets move to "Concluído"
    supabase.functions
      .invoke('fleetdesk-notify-status', {
        body: { task_id: id, completed, completed_at: completedAt },
      })
      .catch((err) => console.warn('FleetDesk sync falhou:', err));

    if (task.googleCalendarEventId) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) return;

        await fetch(`${GOOGLE_CALENDAR_FUNCTION_URL}?action=complete-event`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            eventId: task.googleCalendarEventId,
            completed,
          }),
        });
      } catch (error) {
        console.error('Falha ao sincronizar conclusão com Google Calendar:', error);
      }
    }
  },

  addProject: async (projectData) => {
    const userId = await getUserId();
    if (!userId) return null;

    const maxPosition = Math.max(0, ...get().projects.map((p) => p.position ?? 0));

    // Use the currently selected workspace (falls back to personal one)
    const { useWorkspaceStore } = await import('./workspaceStore');
    let workspaceId = useWorkspaceStore.getState().currentWorkspaceId;

    if (!workspaceId) {
      const { data: ws } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', userId)
        .eq('is_personal', true)
        .maybeSingle();
      workspaceId = ws?.id ?? null;
    }

    if (!workspaceId) {
      console.error('Nenhum workspace disponível para criar o projeto');
      return null;
    }

    const { data, error } = await supabase.rpc('create_project_secure', {
      p_workspace_id: workspaceId,
      p_name: projectData.name,
      p_color: projectData.color,
      p_parent_id: projectData.parentId || null,
      p_is_favorite: !!projectData.isFavorite,
      p_view_type: projectData.viewType || 'list',
      p_description: projectData.description || null,
    });

    if (error) {
      console.error('Erro ao criar projeto:', error);
      throw error;
    }
    if (!data) throw new Error('Projeto não foi criado');

    const newProject: Project = {
      id: data.id,
      name: data.name,
      color: data.color,
      isInbox: data.is_inbox,
      parentId: data.parent_id || null,
      isFavorite: !!data.is_favorite,
      viewType: (data.view_type as 'list' | 'board') || 'list',
      description: data.description || null,
      archivedAt: data.archived_at || null,
      position: data.position ?? 0,
      workspaceId: data.workspace_id || null,
      ownerId: data.owner_id || null,
      teamId: data.team_id || null,
      visibility: (data.visibility as 'private' | 'team' | 'workspace') || 'private',
    };

    set((state) => ({ projects: [...state.projects, newProject] }));
    return newProject;
  },

  updateProject: async (id, updates) => {
    const dbUpdates: Record<string, any> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.color !== undefined) dbUpdates.color = updates.color;
    if (updates.parentId !== undefined) dbUpdates.parent_id = updates.parentId;
    if (updates.isFavorite !== undefined) dbUpdates.is_favorite = updates.isFavorite;
    if (updates.viewType !== undefined) dbUpdates.view_type = updates.viewType;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.workspaceId !== undefined) {
      dbUpdates.workspace_id = updates.workspaceId;
      // Visibilidade segura ao trocar de workspace: força privado e limpa team_id
      dbUpdates.visibility = 'private';
      dbUpdates.team_id = null;
      dbUpdates.parent_id = null; // pais podem não existir no novo workspace
    }
    if (Object.keys(dbUpdates).length > 0) {
      const { error } = await supabase.from('projects').update(dbUpdates).eq('id', id);
      if (error) throw error;
    }
    // Se mudou de workspace, atualiza também as tasks do projeto (workspace_id é NOT NULL)
    if (updates.workspaceId !== undefined) {
      const { error: tErr } = await supabase
        .from('tasks')
        .update({ workspace_id: updates.workspaceId })
        .eq('project_id', id);
      if (tErr) throw tErr;
    }
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id
          ? {
              ...p,
              ...updates,
              ...(updates.workspaceId !== undefined
                ? { visibility: 'private' as const, teamId: null, parentId: null }
                : {}),
            }
          : p
      ),
      tasks:
        updates.workspaceId !== undefined
          ? state.tasks.map((t) => (t.projectId === id ? { ...t, workspaceId: updates.workspaceId } : t))
          : state.tasks,
    }));
  },

  archiveProject: async (id) => {
    await supabase.from('projects').update({ archived_at: new Date().toISOString() }).eq('id', id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    }));
  },

  toggleProjectFavorite: async (id) => {
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;
    const next = !project.isFavorite;
    await supabase.from('projects').update({ is_favorite: next }).eq('id', id);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, isFavorite: next } : p)),
    }));
  },

  deleteProject: async (id) => {
    const inbox = get().projects.find((p) => p.isInbox);
    if (inbox) {
      await supabase.from('tasks').update({ project_id: inbox.id }).eq('project_id', id);
    }
    await supabase.from('projects').update({ parent_id: null }).eq('parent_id', id);
    await supabase.from('projects').delete().eq('id', id);
    set((state) => ({
      projects: state.projects
        .filter((p) => p.id !== id)
        .map((p) => (p.parentId === id ? { ...p, parentId: null } : p)),
      tasks: state.tasks.map((t) => (t.projectId === id ? { ...t, projectId: inbox?.id } : t)),
    }));
  },

  addLabel: async (labelData) => {
    const userId = await getUserId();
    if (!userId) return;

    const { data, error } = await supabase
      .from('labels')
      .insert({ user_id: userId, name: labelData.name, color: labelData.color })
      .select()
      .single();

    if (error || !data) return;
    set((state) => ({
      labels: [...state.labels, { id: data.id, name: data.name, color: data.color, isFavorite: !!data.is_favorite }],
    }));
  },

  deleteLabel: async (id) => {
    await supabase.from('task_labels').delete().eq('label_id', id);
    await supabase.from('labels').delete().eq('id', id);
    set((state) => ({
      labels: state.labels.filter((l) => l.id !== id),
      tasks: state.tasks.map((t) => ({ ...t, labels: t.labels.filter((l) => l !== id) })),
    }));
  },

  toggleLabelFavorite: async (id) => {
    const label = get().labels.find((l) => l.id === id);
    if (!label) return;
    const next = !label.isFavorite;
    await supabase.from('labels').update({ is_favorite: next }).eq('id', id);
    set((state) => ({
      labels: state.labels.map((l) => (l.id === id ? { ...l, isFavorite: next } : l)),
    }));
  },

  setActiveView: (view) => set({ activeView: view, activeProjectId: null, activeLabelId: null }),
  setActiveProjectId: (id) => set({ activeProjectId: id, activeView: 'project' }),
  setActiveLabelId: (id) => set({ activeLabelId: id, activeView: 'label' }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
