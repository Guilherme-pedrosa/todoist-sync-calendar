import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { Task, Project, Label, ViewFilter, Priority, RecurrenceType } from '@/types/task';
import { useUndoStore } from '@/store/undoStore';

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

async function syncTodayGoogleCalendarEvents(
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

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    action: 'list-events',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
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

    const existingGoogleEventIds = new Set(
      currentTasks.map((task) => task.googleCalendarEventId).filter(Boolean) as string[]
    );

    const tasksToInsert = events
      .filter((event) => event.id && !existingGoogleEventIds.has(event.id))
      .map((event) => {
        const { dueDate, dueTime, durationMinutes } = getCalendarDateAndTime(event);
        return {
          user_id: userId,
          title: event.summary?.trim() || 'Evento do Google Calendar',
          description: event.description || null,
          due_date: dueDate || null,
          due_time: dueTime ? `${dueTime}:00` : null,
          duration_minutes: durationMinutes,
          priority: 4,
          project_id: inboxProjectId || null,
          google_calendar_event_id: event.id,
        };
      });

    if (tasksToInsert.length === 0) return currentTasks;

    const { data: insertedRows, error: insertError } = await supabase
      .from('tasks')
      .insert(tasksToInsert)
      .select('*, task_labels(label_id)');

    if (insertError || !insertedRows) return currentTasks;
    const syncedTasks = insertedRows.map(mapDbTaskToTask);
    return [...syncedTasks, ...currentTasks];
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
    const syncedTasks = await syncTodayGoogleCalendarEvents(userId, tasks, inboxProjectId);

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

    useUndoStore.getState().push({
      label: `Criar "${newTask.title}"`,
      undo: async () => {
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

    // Sincroniza com Google Calendar se a tarefa tem evento vinculado
    if (existing?.googleCalendarEventId) {
      const merged: Task = { ...existing, ...updates };
      const touchesCalendar =
        updates.title !== undefined ||
        updates.description !== undefined ||
        updates.dueDate !== undefined ||
        updates.dueTime !== undefined ||
        updates.durationMinutes !== undefined;

      if (touchesCalendar && merged.dueDate) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          if (!accessToken) return;

          const time = merged.dueTime || undefined;
          const duration = merged.durationMinutes ?? 60;
          let endTime: string | undefined;
          if (time) {
            const [h, m] = time.split(':').map(Number);
            const endDate = new Date(2000, 0, 1, h, m + duration);
            endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
          }

          await fetch(`${GOOGLE_CALENDAR_FUNCTION_URL}?action=update-event`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              eventId: existing.googleCalendarEventId,
              title: merged.title,
              description: merged.description ?? '',
              date: merged.dueDate,
              time,
              endTime,
              allDay: !time,
              durationMinutes: duration,
            }),
          });
        } catch (error) {
          console.error('Falha ao sincronizar atualização com Google Calendar:', error);
        }
      }
    }
  },

  deleteTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id);

    await supabase.from('tasks').delete().eq('id', id);
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id && t.parentId !== id),
    }));

    if (task?.googleCalendarEventId) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) return;
        await fetch(
          `${GOOGLE_CALENDAR_FUNCTION_URL}?action=delete-event&eventId=${encodeURIComponent(task.googleCalendarEventId)}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          }
        );
      } catch (error) {
        console.error('Falha ao remover evento do Google Calendar:', error);
      }
    }
  },

  toggleTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;

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
