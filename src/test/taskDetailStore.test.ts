import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskDetailStore } from '@/store/taskDetailStore';
import type { Task } from '@/types/task';

const agendaTask: Task = {
  id: 'agenda-task',
  title: 'Tarefa da agenda',
  completed: false,
  priority: 4,
  dueDate: '2026-08-24',
  dueTime: '14:30',
  durationMinutes: 60,
  labels: [],
  createdAt: '2026-08-24T12:00:00Z',
};

describe('taskDetailStore', () => {
  beforeEach(() => {
    useTaskDetailStore.getState().close();
  });

  it('keeps the agenda snapshot available as soon as the detail opens', () => {
    useTaskDetailStore.getState().open(agendaTask.id, {
      occurrenceDate: agendaTask.dueDate,
      taskSnapshot: agendaTask,
    });

    const state = useTaskDetailStore.getState();
    expect(state.taskId).toBe(agendaTask.id);
    expect(state.taskSnapshot).toEqual(agendaTask);
    expect(state.occurrenceDate).toBe(agendaTask.dueDate);
  });

  it('normalizes a recurring occurrence snapshot to the source task id', () => {
    const occurrence = {
      ...agendaTask,
      id: 'recurring-completion:1',
      sourceTaskId: agendaTask.id,
      isRecurringCompletion: true,
    };

    useTaskDetailStore.getState().open(agendaTask.id, { taskSnapshot: occurrence });

    expect(useTaskDetailStore.getState().taskSnapshot?.id).toBe(agendaTask.id);
  });
});