import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/types/task';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useTaskDetailStore } from '@/store/taskDetailStore';
import UpcomingPage from '@/pages/views/UpcomingPage';

const fixture = vi.hoisted(() => ({
  tasks: [] as Task[],
  projects: [{ id: 'inbox', isInbox: true }],
  toggleSidebar: vi.fn(),
  updateTask: vi.fn(),
  updateWithPrompt: vi.fn().mockResolvedValue(undefined),
  completeTask: vi.fn(),
}));
vi.mock('@/store/taskStore', () => ({
  useTaskStore: Object.assign((selector: (state: typeof fixture) => unknown) => selector(fixture), { getState: () => fixture }),
  mapDbTaskRowToTask: (task: Task) => task,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: undefined }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/useCompleteTask', () => ({ useCompleteTask: () => fixture.completeTask }));
vi.mock('@/hooks/useUpdateTaskWithRecurrencePrompt', () => ({ useUpdateTaskWithRecurrencePrompt: () => fixture.updateWithPrompt }));
vi.mock('@/components/TaskItem', () => ({ TaskItem: ({ task }: { task: Task }) => <div>{task.title}</div> }));
vi.mock('@/components/AddTaskForm', () => ({ AddTaskForm: () => null }));
vi.mock('@/components/KanbanBoard', () => ({ KanbanBoard: () => null }));
vi.mock('@/components/ScheduleMeetingDialog', () => ({ ScheduleMeetingDialog: () => null }));

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: width < 768, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}
function touch(target: Element, type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', clientY: number, clientX = 150) {
  const point = { identifier: 1, clientX, clientY, target };
  return fireEvent[type](target, { touches: type === 'touchEnd' || type === 'touchCancel' ? [] : [point], changedTouches: [point] });
}
function dayColumn(container: HTMLElement) {
  const column = container.querySelector('[data-agenda-day]')!;
  vi.spyOn(column, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 1828, left: 48, right: 390, height: 1728, width: 342, x: 48, y: 100, toJSON: () => ({}) });
  return column;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 12, 12));
  vi.clearAllMocks();
  setViewport(390);
  window.history.replaceState({}, '', '/upcoming');
  fixture.tasks = [{ id: 'task-1', title: 'Revisar equipamento', completed: false, priority: 4, dueDate: '2026-09-12', dueTime: '09:00', durationMinutes: 60, labels: [], createdAt: '2026-09-12T09:00:00Z' }];
  useQuickAddStore.getState().closeQuickAdd();
  useTaskDetailStore.getState().close();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('agenda mobile', () => {
  it('creates a task at the tapped day/time, with no long press required', () => {
    const { container } = render(<UpcomingPage />);
    const column = dayColumn(container);
    touch(column, 'touchStart', 244);
    touch(column, 'touchEnd', 244);
    expect(useQuickAddStore.getState()).toMatchObject({ open: true, defaultDueDate: '2026-09-12', defaultDueTime: '07:30', defaultDurationMinutes: 60 });
  });

  it('leaves ordinary vertical swipes to scrolling without creating or moving a task', () => {
    const { container } = render(<UpcomingPage />);
    const column = dayColumn(container);
    touch(column, 'touchStart', 244);
    expect(touch(column, 'touchMove', 210)).toBe(true);
    act(() => { vi.advanceTimersByTime(500); });
    touch(column, 'touchEnd', 180);
    expect(useQuickAddStore.getState().open).toBe(false);
    expect(fixture.updateWithPrompt).not.toHaveBeenCalled();
  });

  it('opens the task on a tap and keeps the agenda occurrence context', () => {
    render(<UpcomingPage />);
    const event = screen.getByRole('button', { name: '09:00, Revisar equipamento' });
    touch(event, 'touchStart', 400);
    touch(event, 'touchEnd', 400);
    expect(useTaskDetailStore.getState()).toMatchObject({ taskId: 'task-1', occurrenceDate: '2026-09-12' });
    expect(useQuickAddStore.getState().open).toBe(false);
  });

  it('also opens historical completed occurrences on touch', () => {
    fixture.tasks[0] = { ...fixture.tasks[0], id: 'completion-1', sourceTaskId: 'task-1', completed: true, isRecurringCompletion: true };
    render(<UpcomingPage />);
    const event = screen.getByRole('button', { name: '09:00, Revisar equipamento' });
    touch(event, 'touchStart', 400);
    touch(event, 'touchEnd', 400);
    expect(useTaskDetailStore.getState().taskId).toBe('task-1');
  });

  it('does not open the task underneath its completion control', () => {
    render(<UpcomingPage />);
    const control = screen.getByRole('button', { name: 'Marcar como concluída' });
    touch(control, 'touchStart', 400);
    touch(control, 'touchEnd', 400);
    fireEvent.click(control);
    expect(fixture.completeTask).toHaveBeenCalledWith('task-1', { occurrenceDate: '2026-09-12' });
    expect(useTaskDetailStore.getState().taskId).toBeNull();
  });

  it('discards a held creation gesture when the browser cancels it', () => {
    const { container } = render(<UpcomingPage />);
    const column = dayColumn(container);
    touch(column, 'touchStart', 244);
    act(() => { vi.advanceTimersByTime(450); });
    expect(touch(column, 'touchMove', 292)).toBe(false);
    touch(column, 'touchCancel', 292);
    touch(column, 'touchEnd', 292);
    expect(useQuickAddStore.getState().open).toBe(false);
    expect(fixture.updateWithPrompt).not.toHaveBeenCalled();
  });

  it('discards a move on pointer cancellation rather than persisting the preview', () => {
    const { container } = render(<UpcomingPage />);
    dayColumn(container);
    const event = screen.getByRole('button', { name: '09:00, Revisar equipamento' });
    touch(event, 'touchStart', 400);
    act(() => { vi.advanceTimersByTime(450); });
    touch(event, 'touchMove', 450);
    fireEvent.pointerCancel(window);
    touch(event, 'touchEnd', 450);
    expect(fixture.updateWithPrompt).not.toHaveBeenCalled();
    expect(useTaskDetailStore.getState().taskId).toBeNull();
  });

  it('keeps the chosen day when changing list/day view and supports choosing a date', () => {
    const { container } = render(<UpcomingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Próximo dia' }));
    fireEvent.click(screen.getByRole('button', { name: /^Lista$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Dia$/ }));
    expect(container.querySelector('[data-agenda-day]')).toHaveAttribute('data-agenda-day', '2026-09-13');
    fireEvent.change(screen.getByLabelText('Escolher data da agenda'), { target: { value: '2026-10-15' } });
    expect(container.querySelector('[data-agenda-day]')).toHaveAttribute('data-agenda-day', '2026-10-15');
  });

  it('retains the same week when changing desktop day/week modes', () => {
    setViewport(1280);
    const { container } = render(<UpcomingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    expect(container.querySelector('[data-agenda-day]')).toHaveAttribute('data-agenda-day', '2026-09-14');
    fireEvent.click(screen.getByRole('button', { name: /^Dia$/ }));
    expect(container.querySelector('[data-agenda-day]')).toHaveAttribute('data-agenda-day', '2026-09-19');
    fireEvent.click(screen.getByRole('button', { name: /^Semana$/ }));
    expect(container.querySelector('[data-agenda-day]')).toHaveAttribute('data-agenda-day', '2026-09-14');
  });
});
