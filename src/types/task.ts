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
  durationMinutes?: number | null;
  dueString?: string | null;
  deadline?: string | null;
  recurrenceRule?: string | null;
  projectId?: string;
  sectionId?: string | null;
  parentId?: string;
  labels: string[];
  recurrence?: Recurrence;
  createdAt: string;
  completedAt?: string;
  googleCalendarEventId?: string;
  taskNumber?: number | null;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  isInbox?: boolean;
  icon?: string;
  parentId?: string | null;
  isFavorite?: boolean;
  viewType?: 'list' | 'board';
  description?: string | null;
  archivedAt?: string | null;
  position?: number;
  workspaceId?: string | null;
  ownerId?: string | null;
  teamId?: string | null;
  visibility?: 'private' | 'team' | 'workspace';
}

export interface Label {
  id: string;
  name: string;
  color: string;
  isFavorite?: boolean;
}

export interface Filter {
  id: string;
  name: string;
  query: string;
  color: string;
  isFavorite: boolean;
  position: number;
}

export interface UserSettings {
  language: string;
  timezone: string;
  timeFormat: '12h' | '24h';
  dateFormat: string;
  weekStart: number;
  homePage: string;
  smartDateRecognition: boolean;
  theme: string;
  autoDarkMode: boolean;
  defaultReminderMinutes: number;
  reminderChannels: string[];
  dailyGoal: number;
  weeklyGoal: number;
  vacationMode: boolean;
  daysOff: string[];
  karmaEnabled: boolean;
  quickAddChips: string[];
  sidebarOrder: string[];
  sidebarHidden: string[];
  showTaskDescription: boolean;
  celebrations: boolean;
  deleteCalendarEventOnComplete: boolean;
}

export type ViewFilter = 'inbox' | 'today' | 'upcoming' | 'project' | 'label' | 'completed' | 'filter';
