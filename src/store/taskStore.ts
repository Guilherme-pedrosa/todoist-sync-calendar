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
    }
  ) => Promise<Task | null>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
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

function isSameCalendarSlot(task: Task, event: GoogleCalendarEvent) {
  const parsed = getCalendarDateAndTime(event);
  return (
    !task.completed &&
    !task.googleCalendarEventId &&
    normalizeCalendarTitle(task.title) === normalizeCalendarTitle(event.summary) &&
    task.dueDate === parsed.dueDate &&
    (task.dueTime ?? null) === (parsed.dueTime ?? null) &&
    (task.durationMinutes ?? null) === (parsed.durationMinutes ?? null)
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
    (task.dueTime ?? null) === (parsed.dueTime ?? null) &&
    (task.durationMinutes ?? null) === (parsed.durationMinutes ?? null)
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
  const idsToDelete = new Set<string>();
  const byGoogleId = new Map<string, Task[]>();

  for (const task of tasks) {
    if (task.googleCalendarEventId) {
      const list = byGoogleId.get(task.googleCalendarEventId) ?? [];
      list.push(task);
      byGoogleId.set(task.googleCalendarEventId, list);
    }
  }

  for (const list of byGoogleId.values()) {
    if (list.length <= 1) continue;
    list
      .sort((a, b) => Number(a.completed) - Number(b.completed) || a.createdAt.localeCompare(b.createdAt))
      .slice(1)
      .forEach((task) => idsToDelete.add(task.id));
  }

  const recurring = tasks.filter((task) => task.recurrenceRule);
  for (const task of tasks) {
    if (idsToDelete.has(task.id) || !task.googleCalendarEventId) continue;
    if (recurring.some((series) => recurrenceCoversTask(series, task))) {
      idsToDelete.add(task.id);
    }
  }

  if (idsToDelete.size === 0) return tasks;
  await supabase.from('tasks').delete().in('id', Array.from(idsToDelete));
  return tasks.filter((task) => !idsToDelete.has(task.id));
}

async function createGoogleCalendarEvent(task: Task): Promise<string | null> {
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
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return typeof payload?.id === 'string' ? payload.id : null;
}

async function updateGoogleCalendarEvent(task: Task): Promise<void> {
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
  const { data: tokenRows, error: tokenError } = await supabase
    .from('google_tokens')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (tokenError || !tokenRows?.length) return currentTasks;

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return currentTasks;

  const startOfRange = new Date();
  startOfRange.setHours(0, 0, 0, 0);
  const endOfRange = new Date();
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

    for (const event of events) {
      if (!event.id) continue;
      const { dueDate, dueTime, durationMinutes } = getCalendarDateAndTime(event);
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
        const duplicateIds = nextTasks
          .filter((task) => task.id !== linkedTask.id && taskMatchesCalendarEvent(task, event))
          .map((task) => task.id);
        if (duplicateIds.length > 0) {
          await supabase.from('tasks').delete().in('id', duplicateIds);
          nextTasks = nextTasks.filter((task) => !duplicateIds.includes(task.id));
        }
        await supabase.from('tasks').update(payload).eq('id', linkedTask.id);
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
        await supabase.from('tasks').update({ google_calendar_event_id: event.id }).eq('id', duplicateTask.id);
        nextTasks = nextTasks.map((task) =>
          task.id === duplicateTask.id ? { ...task, googleCalendarEventId: event.id } : task
        );
        continue;
      }

      tasksToInsert.push({
        user_id: userId,
        ...payload,
        priority: 4,
        project_id: inboxProjectId || null,
      });
    }

    if (tasksToInsert.length === 0) return nextTasks;

    const { data: insertedRows, error: insertError } = await supabase
      .from('tasks')
      .insert(tasksToInsert as any)
      .select('*, task_labels(label_id)');

    if (insertError || !insertedRows) return currentTasks;
    const syncedTasks = insertedRows.map(mapDbTaskToTask);
    return [...syncedTasks, ...nextTasks];
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
      supabase.from('projects').select('*').eq('user_id', userId).order('position'),
      supabase.from('labels').select('*').eq('user_id', userId),
      supabase.from('tasks').select('*, task_labels(label_id)').eq('user_id', userId),
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
      }));

    const labels: Label[] = (labelsRes.data || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      isFavorite: !!l.is_favorite,
    }));

    const tasks: Task[] = (tasksRes.data || []).map(mapDbTaskToTask);
    const inboxProjectId = projects.find((p) => p.isInbox)?.id;
    const syncedTasks = await syncGoogleCalendarEvents(userId, tasks, inboxProjectId);

    set({ projects, labels, tasks: syncedTasks, loading: false });
  },

  addTask: async (taskData) => {
    const userId = await getUserId();
    if (!userId) return null;

    const inboxProject = get().projects.find((p) => p.isInbox);

    const insertPayload: Record<string, any> = {
      user_id: userId,
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
      project_id: taskData.projectId || inboxProject?.id || null,
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

    // Reminder (only if due_time present and reminderMinutes provided/default)
    if (data.due_date && data.due_time && taskData.reminderMinutes != null) {
      const triggerAt = new Date(`${data.due_date}T${data.due_time}`);
      triggerAt.setMinutes(triggerAt.getMinutes() - taskData.reminderMinutes);
      await supabase.from('reminders').insert({
        task_id: data.id,
        trigger_at: triggerAt.toISOString(),
        type: 'absolute',
        relative_minutes: taskData.reminderMinutes,
        channel: 'push',
      });
    }

    const newTask: Task = mapDbTaskToTask({ ...data, task_labels: labelIds.map((id) => ({ label_id: id })) });
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

    useUndoStore.getState().push({
      label: `Criar "${newTask.title}"`,
      undo: async () => {
        await deleteGoogleCalendarEvent(newTask.googleCalendarEventId);
        await supabase.from('tasks').delete().eq('id', newTask.id);
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== newTask.id) }));
      },
    });

    return newTask;
  },

  updateTask: async (id, updates) => {
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
      await supabase.from('tasks').update(dbUpdates).eq('id', id);
    }

    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));

    // Registra undo restaurando campos anteriores
    if (existing) {
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
  },

  deleteTask: async (id) => {
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

    if (task) {
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

    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        name: projectData.name,
        color: projectData.color,
        parent_id: projectData.parentId || null,
        is_favorite: !!projectData.isFavorite,
        view_type: projectData.viewType || 'list',
        description: projectData.description || null,
        position: maxPosition + 1,
      })
      .select()
      .single();

    if (error || !data) return null;

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
    if (Object.keys(dbUpdates).length > 0) {
      await supabase.from('projects').update(dbUpdates).eq('id', id);
    }
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
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
