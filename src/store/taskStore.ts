import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Task, Project, Label, ViewFilter, Priority, Recurrence } from '@/types/task';

interface TaskState {
  tasks: Task[];
  projects: Project[];
  labels: Label[];
  activeView: ViewFilter;
  activeProjectId: string | null;
  activeLabelId: string | null;
  sidebarOpen: boolean;

  // Task actions
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'completed' | 'completedAt'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTask: (id: string) => void;

  // Project actions
  addProject: (project: Omit<Project, 'id'>) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  // Label actions
  addLabel: (label: Omit<Label, 'id'>) => void;
  deleteLabel: (id: string) => void;

  // View actions
  setActiveView: (view: ViewFilter) => void;
  setActiveProjectId: (id: string | null) => void;
  setActiveLabelId: (id: string | null) => void;
  toggleSidebar: () => void;
}

const generateId = () => crypto.randomUUID();

const DEFAULT_PROJECTS: Project[] = [
  { id: 'inbox', name: 'Caixa de Entrada', color: 'hsl(230, 10%, 50%)' },
  { id: 'personal', name: 'Pessoal', color: 'hsl(152, 60%, 42%)' },
  { id: 'work', name: 'Trabalho', color: 'hsl(262, 60%, 55%)' },
];

const DEFAULT_LABELS: Label[] = [
  { id: 'urgent', name: 'Urgente', color: 'hsl(0, 72%, 51%)' },
  { id: 'meeting', name: 'Reunião', color: 'hsl(262, 60%, 55%)' },
  { id: 'email', name: 'E-mail', color: 'hsl(38, 92%, 50%)' },
];

const today = new Date().toISOString().split('T')[0];
const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

const SAMPLE_TASKS: Task[] = [
  {
    id: generateId(),
    title: 'Revisar relatório mensal',
    description: 'Verificar os números do Q1 e preparar apresentação',
    completed: false,
    priority: 1,
    dueDate: today,
    dueTime: '14:00',
    projectId: 'work',
    labels: ['urgent'],
    createdAt: new Date().toISOString(),
  },
  {
    id: generateId(),
    title: 'Comprar presentes de aniversário',
    completed: false,
    priority: 2,
    dueDate: tomorrow,
    projectId: 'personal',
    labels: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: generateId(),
    title: 'Responder e-mails pendentes',
    completed: false,
    priority: 3,
    dueDate: today,
    projectId: 'work',
    labels: ['email'],
    createdAt: new Date().toISOString(),
    recurrence: { type: 'daily', interval: 1 },
  },
  {
    id: generateId(),
    title: 'Agendar dentista',
    completed: false,
    priority: 4,
    projectId: 'personal',
    labels: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: generateId(),
    title: 'Preparar reunião de sprint',
    description: 'Definir backlog e prioridades para próxima sprint',
    completed: false,
    priority: 2,
    dueDate: today,
    dueTime: '10:00',
    projectId: 'work',
    labels: ['meeting'],
    createdAt: new Date().toISOString(),
    recurrence: { type: 'weekly', interval: 1 },
  },
];

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: SAMPLE_TASKS,
      projects: DEFAULT_PROJECTS,
      labels: DEFAULT_LABELS,
      activeView: 'today',
      activeProjectId: null,
      activeLabelId: null,
      sidebarOpen: true,

      addTask: (taskData) => {
        const task: Task = {
          ...taskData,
          id: generateId(),
          completed: false,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ tasks: [task, ...state.tasks] }));
      },

      updateTask: (id, updates) => {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        }));
      },

      deleteTask: (id) => {
        set((state) => ({
          tasks: state.tasks.filter((t) => t.id !== id && t.parentId !== id),
        }));
      },

      toggleTask: (id) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  completed: !t.completed,
                  completedAt: !t.completed ? new Date().toISOString() : undefined,
                }
              : t
          ),
        }));
      },

      addProject: (projectData) => {
        const project: Project = { ...projectData, id: generateId() };
        set((state) => ({ projects: [...state.projects, project] }));
      },

      updateProject: (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        }));
      },

      deleteProject: (id) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          tasks: state.tasks.map((t) => (t.projectId === id ? { ...t, projectId: 'inbox' } : t)),
        }));
      },

      addLabel: (labelData) => {
        const label: Label = { ...labelData, id: generateId() };
        set((state) => ({ labels: [...state.labels, label] }));
      },

      deleteLabel: (id) => {
        set((state) => ({
          labels: state.labels.filter((l) => l.id !== id),
          tasks: state.tasks.map((t) => ({
            ...t,
            labels: t.labels.filter((l) => l !== id),
          })),
        }));
      },

      setActiveView: (view) => set({ activeView: view }),
      setActiveProjectId: (id) => set({ activeProjectId: id, activeView: 'project' }),
      setActiveLabelId: (id) => set({ activeLabelId: id, activeView: 'label' }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    }),
    {
      name: 'taskflow-storage',
    }
  )
);
