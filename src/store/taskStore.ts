import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { Task, Project, Label, ViewFilter, Priority, RecurrenceType } from '@/types/task';
import { useUndoStore } from '@/store/undoStore';
import { expandOccurrencesInRange } from '@/lib/recurrence';

import type { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';

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

  // Atomic realtime apply actions (no refetch)
  applyTaskUpsertFromDb: (row: any) => void;
  applyTaskDelete: (id: string) => void;
  applyTaskAssigneeChange: (taskId: string, userId: string, op: 'add' | 'remove') => void;
  applyTaskLabelChange: (taskId: string, labelId: string, op: 'add' | 'remove') => void;
  applyMeetingInvitationChange: (taskId: string, inviteeUserId: string | null, op: 'add' | 'remove') => void;
  applyProjectUpsertFromDb: (row: any) => void;
  applyProjectDelete: (id: string) => void;
}

export function mapDbTaskRowToTask(t: any): Task | null {
  return mapDbTaskToTask(t);
}

function mapDbProjectToProject(p: any): Project {
  return {
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
  };
}

// Google Calendar integration removed. Internal calendar/agenda only.

export async function ensureFreshSession(): Promise<Session | null> {
  console.info('[addTask] step=session-check');
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;

  if (error || !session) {
    console.warn('[addTask] aborted reason=session-null', { error });
    toast.error('Sessão expirada, faça login');
    await supabase.auth.signOut();
    return null;
  }

  const expiresAt = session.expires_at ?? 0;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSeconds >= 60) return session;

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshed.session) {
    console.warn('[addTask] aborted reason=refresh-failed', { refreshError });
    toast.error('Sessão expirada, faça login');
    await supabase.auth.signOut();
    return null;
  }

  return refreshed.session;
}


function mapDbTaskToTask(t: any): Task | null {
  // Defesa em profundidade: ignorar linhas com soft-delete.
  if (t?.deleted_at) return null;
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

    taskNumber: t.task_number ?? null,
    assigneeIds: (t.task_assignees || []).filter((a: any) => (a.role ?? 'responsible') !== 'informed').map((a: any) => a.user_id),
    informedIds: (t.task_assignees || []).filter((a: any) => a.role === 'informed').map((a: any) => a.user_id),
    meetingInviteeIds: (t.meeting_invitations || [])
      .map((i: any) => i.invitee_user_id)
      .filter(Boolean),
    createdAt: t.created_at,
  };
}

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
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
  const normalize = (v?: string | null) => (v || '').replace(/^✅\s*/, '').trim().toLowerCase();
  return (
    series.id !== occurrence.id &&
    !series.completed &&
    !occurrence.completed &&
    occurrences.includes(occurrence.dueDate) &&
    normalize(series.title) === normalize(occurrence.title) &&
    (series.dueTime ?? null) === (occurrence.dueTime ?? null)
  );
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
      supabase
        .from('tasks')
        .select('*, task_labels(label_id), task_assignees(user_id, role), meeting_invitations(invitee_user_id)')
        .is('deleted_at', null),
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

    const tasks: Task[] = (tasksRes.data || [])
      .map(mapDbTaskToTask)
      .filter((t): t is Task => t !== null);

    set({ projects, labels, tasks, loading: false });
  },

  addTask: async (taskData, options) => {
    const session = await ensureFreshSession();
    if (!session) {
      console.warn('[addTask] aborted reason=no-session');
      return null;
    }
    const userId = session.user.id;

    const inboxProject = get().projects.find((p) => p.isInbox);
    const targetProjectId = taskData.projectId || inboxProject?.id || null;
    const targetProject = targetProjectId
      ? get().projects.find((p) => p.id === targetProjectId)
      : null;
    console.info('[addTask] step=resolve-project', { projectId: targetProjectId, hasInbox: !!inboxProject });
    // Resolve workspaceId SEMPRE a partir do projeto-alvo.
    // Se não conseguir, aborta — nunca usa workspace pessoal como fallback.
    let workspaceId: string | null = null;
    if (targetProject && (targetProject as any).workspaceId) {
      workspaceId = (targetProject as any).workspaceId;
    } else if (targetProjectId) {
      const { data: proj, error: projErr } = await supabase
        .from('projects')
        .select('workspace_id')
        .eq('id', targetProjectId)
        .maybeSingle();
      if (projErr) {
        console.warn('[addTask] aborted reason=project-fetch-error', { projErr });
        toast.error('Não foi possível resolver o workspace do projeto');
        return null;
      }
      workspaceId = proj?.workspace_id ?? null;
    }
    if (!workspaceId || !targetProjectId) {
      console.warn('[addTask] aborted reason=missing-workspace-or-project', { workspaceId, targetProjectId });
      toast.error(
        targetProjectId
          ? 'O projeto selecionado está sem workspace. Atualize a página.'
          : 'Selecione um projeto antes de criar a tarefa.'
      );
      return null;
    }
    console.info('[addTask] step=resolve-workspace', { workspaceId, targetProjectId });

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
      
      project_id: targetProjectId,
      section_id: taskData.sectionId || null,
      parent_id: taskData.parentId || null,
    };
    console.info('[addTask] step=insert-payload', insertPayload);

    const { data, error } = await (supabase as any).rpc('create_task_secure', {
      p_workspace_id: insertPayload.workspace_id,
      p_project_id: insertPayload.project_id,
      p_title: insertPayload.title,
      p_description: insertPayload.description,
      p_priority: insertPayload.priority,
      p_due_date: insertPayload.due_date,
      p_due_time: insertPayload.due_time,
      p_duration_minutes: insertPayload.duration_minutes,
      p_due_string: insertPayload.due_string,
      p_deadline: insertPayload.deadline,
      p_recurrence_rule: insertPayload.recurrence_rule,
      p_google_calendar_event_id: insertPayload.google_calendar_event_id,
      p_section_id: insertPayload.section_id,
      p_parent_id: insertPayload.parent_id,
    });
    console.info('[addTask] step=insert-response', { id: data?.id, error });

    if (error || !data) {
      console.warn('[addTask] aborted reason=insert-failed', { error, payload: insertPayload });
      const msg = error?.message
        ? `Falha ao criar tarefa: ${error.message}`
        : 'Falha ao criar tarefa (sem dados retornados)';
      toast.error(msg, {
        description: error?.code ? `código ${error.code}` : undefined,
      });
      return null;
    }
    console.info('[addTask] step=local-insert', { id: data.id });

    const labelIds = taskData.labels || [];
    if (labelIds.length > 0) {
      await supabase.from('task_labels').insert(
        labelIds.map((labelId) => ({ task_id: data.id, label_id: labelId }))
      );
    }

    // Assignees extras: o trigger trg_auto_add_task_owner_as_assignee insere o owner
    // automaticamente no banco; aqui adicionamos APENAS assignees adicionais (delegados).
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
    const newTask = mapDbTaskToTask({
      ...data,
      task_labels: labelIds.map((id) => ({ label_id: id })),
      task_assignees: allAssignees.map((uid) => ({ user_id: uid })),
    });
    if (!newTask) return null;
    set((state) => ({ tasks: [newTask, ...state.tasks] }));

    if (!options?.skipUndo) {
      useUndoStore.getState().push({
        label: `Criar "${newTask.title}"`,
        undo: async () => {
          await supabase.from('tasks').delete().eq('id', newTask.id);
          set((state) => ({ tasks: state.tasks.filter((t) => t.id !== newTask.id) }));
        },
      });
    }

    return newTask;
  },

  updateTask: async (id, updates, options) => {
    const session = await ensureFreshSession();
    if (!session) return;

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
      const { error } = await supabase.from('tasks').update(dbUpdates).eq('id', id);
      if (error) {
        console.error('updateTask error', error);
        throw error;
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
    const session = await ensureFreshSession();
    if (!session) return;

    const task = get().tasks.find((t) => t.id === id);
    const children = get().tasks.filter((t) => t.parentId === id);
    const childIds = children.map((c) => c.id);

    const now = new Date().toISOString();
    // Soft-delete: a tarefa (e suas filhas) somem dos selects e do realtime,
    // mas continuam no banco para impedir ressurreição via integrações externas
    // e para permitir undo restaurando deleted_at = null.
    const idsToDelete = [id, ...childIds];
    await supabase
      .from('tasks')
      .update({ deleted_at: now })
      .in('id', idsToDelete);
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id && t.parentId !== id),
    }));


    if (task && !options?.skipUndo) {
      const snapshot = { ...task };
      const childrenSnap = children.map((c) => ({ ...c }));
      useUndoStore.getState().push({
        label: `Excluir "${task.title}"`,
        undo: async () => {
          await supabase
            .from('tasks')
            .update({ deleted_at: null })
            .in('id', idsToDelete);
          set((state) => ({ tasks: [snapshot, ...childrenSnap, ...state.tasks] }));
        },
      });
    }
  },

  toggleTask: async (id) => {
    const session = await ensureFreshSession();
    if (!session) return;

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

  applyTaskUpsertFromDb: (row) => {
    if (!row?.id) return;
    set((state) => {
      const existing = state.tasks.find((t) => t.id === row.id);
      // Preserve existing assignees/labels/meeting invitees if not in payload
      const merged = mapDbTaskToTask({
        ...row,
        task_labels: row.task_labels ?? (existing ? existing.labels.map((id) => ({ label_id: id })) : []),
        task_assignees: row.task_assignees ?? (existing ? existing.assigneeIds.map((id) => ({ user_id: id })) : []),
        meeting_invitations:
          row.meeting_invitations ??
          (existing ? existing.meetingInviteeIds.map((id) => ({ invitee_user_id: id })) : []),
      });
      // Soft-deleted: comporta-se como remoção.
      if (!merged) {
        return { tasks: state.tasks.filter((t) => t.id !== row.id) };
      }
      if (existing) {
        return { tasks: state.tasks.map((t) => (t.id === row.id ? { ...t, ...merged } : t)) };
      }
      return { tasks: [...state.tasks, merged] };
    });
  },

  applyTaskDelete: (id) => {
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
  },

  applyTaskAssigneeChange: (taskId, userId, op) => {
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const set1 = new Set(t.assigneeIds || []);
        if (op === 'add') set1.add(userId);
        else set1.delete(userId);
        return { ...t, assigneeIds: Array.from(set1) };
      }),
    }));
  },

  applyTaskLabelChange: (taskId, labelId, op) => {
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const set1 = new Set(t.labels || []);
        if (op === 'add') set1.add(labelId);
        else set1.delete(labelId);
        return { ...t, labels: Array.from(set1) };
      }),
    }));
  },

  applyMeetingInvitationChange: (taskId, inviteeUserId, op) => {
    if (!inviteeUserId) return;
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const set1 = new Set(t.meetingInviteeIds || []);
        if (op === 'add') set1.add(inviteeUserId);
        else set1.delete(inviteeUserId);
        return { ...t, meetingInviteeIds: Array.from(set1) };
      }),
    }));
  },

  applyProjectUpsertFromDb: (row) => {
    if (!row?.id) return;
    if (row.archived_at) {
      set((state) => ({ projects: state.projects.filter((p) => p.id !== row.id) }));
      return;
    }
    const mapped = mapDbProjectToProject(row);
    set((state) => {
      const exists = state.projects.some((p) => p.id === row.id);
      const projects = exists
        ? state.projects.map((p) => (p.id === row.id ? mapped : p))
        : [...state.projects, mapped];
      return { projects: projects.sort((a, b) => (a.position || 0) - (b.position || 0)) };
    });
  },

  applyProjectDelete: (id) => {
    set((state) => ({ projects: state.projects.filter((p) => p.id !== id) }));
  },
}));
