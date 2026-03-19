export type Priority = 1 | 2 | 3 | 4;

export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Recurrence {
  type: RecurrenceType;
  interval: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: Priority;
  dueDate?: string;
  dueTime?: string;
  projectId?: string;
  parentId?: string;
  labels: string[];
  recurrence?: Recurrence;
  createdAt: string;
  completedAt?: string;
  googleCalendarEventId?: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  isInbox?: boolean;
  icon?: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export type ViewFilter = 'inbox' | 'today' | 'upcoming' | 'project' | 'label' | 'completed';
