export type Priority = 1 | 2 | 3 | 4;

export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Recurrence {
  type: RecurrenceType;
  interval: number; // every N days/weeks/months/years
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: Priority;
  dueDate?: string; // ISO date string
  dueTime?: string; // HH:mm
  projectId: string;
  parentId?: string; // for subtasks
  labels: string[];
  recurrence?: Recurrence;
  createdAt: string;
  completedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  icon?: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export type ViewFilter = 'inbox' | 'today' | 'upcoming' | 'project' | 'label' | 'completed';
