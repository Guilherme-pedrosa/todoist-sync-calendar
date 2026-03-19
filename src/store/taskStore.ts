import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { Task, Project, Label, ViewFilter, Priority, RecurrenceType } from '@/types/task';

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

  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'completed' | 'completedAt' | 'labels'> & { labels?: string[] }) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;

  addProject: (project: Omit<Project, 'id'>) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  addLabel: (label: Omit<Label, 'id'>) => Promise<void>;
  deleteLabel: (id: string) => Promise<void>;

  setActiveView: (view: ViewFilter) => void;
  setActiveProjectId: (id: string | null) => void;
  setActiveLabelId: (id: string | null) => void;
  toggleSidebar: () => void;
}

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export const useTaskStore = create<TaskState>()((set, get) => ({
  tasks: [],
  projects: [],
  labels: [],
  activeView: 'today',
  activeProjectId: null,
  activeLabelId: null,
  sidebarOpen: true,
  loading: true,

  fetchData: async () => {
    const userId = await getUserId();
    if (!userId) return;

    const [projectsRes, labelsRes, tasksRes] = await Promise.all([
      supabase.from('projects').select('*').eq('user_id', userId).order('position'),
      supabase.from('labels').select('*').eq('user_id', userId),
      supabase.from('tasks').select('*, task_labels(label_id)').eq('user_id', userId),
    ]);

    const projects: Project[] = (projectsRes.data || []).map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isInbox: p.is_inbox,
    }));

    const labels: Label[] = (labelsRes.data || []).map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
    }));

    const tasks: Task[] = (tasksRes.data || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description || undefined,
      completed: t.completed,
      completedAt: t.completed_at || undefined,
      priority: t.priority as Priority,
      dueDate: t.due_date || undefined,
      dueTime: t.due_time ? t.due_time.slice(0, 5) : undefined,
      projectId: t.project_id || undefined,
      parentId: t.parent_id || undefined,
      labels: (t.task_labels || []).map((tl: any) => tl.label_id),
      recurrence: t.recurrence_type
        ? { type: t.recurrence_type as RecurrenceType, interval: t.recurrence_interval || 1 }
        : undefined,
      googleCalendarEventId: t.google_calendar_event_id || undefined,
      createdAt: t.created_at,
    }));

    set({ projects, labels, tasks, loading: false });
  },

  addTask: async (taskData) => {
    const userId = await getUserId();
    if (!userId) return;

    const inboxProject = get().projects.find((p) => p.isInbox);

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        title: taskData.title,
        description: taskData.description || null,
        priority: taskData.priority || 4,
        due_date: taskData.dueDate || null,
        due_time: taskData.dueTime ? `${taskData.dueTime}:00` : null,
        project_id: taskData.projectId || inboxProject?.id || null,
        parent_id: taskData.parentId || null,
        recurrence_type: taskData.recurrence?.type || null,
        recurrence_interval: taskData.recurrence?.interval || null,
      })
      .select()
      .single();

    if (error || !data) return;

    const labelIds = taskData.labels || [];
    if (labelIds.length > 0) {
      await supabase.from('task_labels').insert(
        labelIds.map((labelId) => ({ task_id: data.id, label_id: labelId }))
      );
    }

    const newTask: Task = {
      id: data.id,
      title: data.title,
      description: data.description || undefined,
      completed: data.completed,
      priority: data.priority as Priority,
      dueDate: data.due_date || undefined,
      dueTime: data.due_time ? data.due_time.slice(0, 5) : undefined,
      projectId: data.project_id || undefined,
      parentId: data.parent_id || undefined,
      labels: labelIds,
      recurrence: data.recurrence_type
        ? { type: data.recurrence_type as RecurrenceType, interval: data.recurrence_interval || 1 }
        : undefined,
      createdAt: data.created_at,
    };

    set((state) => ({ tasks: [newTask, ...state.tasks] }));
  },

  updateTask: async (id, updates) => {
    const dbUpdates: Record<string, any> = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
    if (updates.dueTime !== undefined) dbUpdates.due_time = updates.dueTime ? `${updates.dueTime}:00` : null;
    if (updates.projectId !== undefined) dbUpdates.project_id = updates.projectId;
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
  },

  deleteTask: async (id) => {
    await supabase.from('tasks').delete().eq('id', id);
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id && t.parentId !== id),
    }));
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
  },

  addProject: async (projectData) => {
    const userId = await getUserId();
    if (!userId) return;

    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: userId, name: projectData.name, color: projectData.color })
      .select()
      .single();

    if (error || !data) return;

    set((state) => ({
      projects: [...state.projects, { id: data.id, name: data.name, color: data.color, isInbox: data.is_inbox }],
    }));
  },

  updateProject: async (id, updates) => {
    const dbUpdates: Record<string, any> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.color !== undefined) dbUpdates.color = updates.color;
    await supabase.from('projects').update(dbUpdates).eq('id', id);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  },

  deleteProject: async (id) => {
    const inbox = get().projects.find((p) => p.isInbox);
    if (inbox) {
      await supabase.from('tasks').update({ project_id: inbox.id }).eq('project_id', id);
    }
    await supabase.from('projects').delete().eq('id', id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
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
      labels: [...state.labels, { id: data.id, name: data.name, color: data.color }],
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

  setActiveView: (view) => set({ activeView: view, activeProjectId: null, activeLabelId: null }),
  setActiveProjectId: (id) => set({ activeProjectId: id, activeView: 'project' }),
  setActiveLabelId: (id) => set({ activeLabelId: id, activeView: 'label' }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
