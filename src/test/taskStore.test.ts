import { beforeEach, describe, expect, it, vi } from 'vitest';

// O taskStore importa o cliente Supabase no topo do módulo. Nenhum teste aqui
// toca a rede: só exercitamos as reduções síncronas do store (índices derivados,
// aplicação de eventos de realtime e limpeza na troca de usuário).
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
      refreshSession: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useTaskStore, clearUserScopedTaskState } from '@/store/taskStore';
import type { Task } from '@/types/task';

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: `Tarefa ${overrides.id}`,
    completed: false,
    priority: 4,
    labels: [],
    createdAt: '2026-08-26T12:00:00Z',
    ...overrides,
  } as Task;
}

/** Linha como o Postgres devolve (snake_case), para os apply* do realtime. */
function makeRow(over: Record<string, unknown> & { id: string }) {
  return {
    title: `Tarefa ${over.id}`,
    completed: false,
    priority: 4,
    created_at: '2026-08-26T12:00:00Z',
    deleted_at: null,
    task_labels: [],
    task_assignees: [],
    meeting_invitations: [],
    ...over,
  };
}

const EMPTY = {
  tasks: [] as Task[],
  projects: [],
  labels: [],
  sections: [],
  childrenByParentId: {},
  projectById: {},
  labelById: {},
};

beforeEach(() => {
  useTaskStore.setState(EMPTY);
  clearUserScopedTaskState();
  useTaskStore.setState(EMPTY);
});

describe('índices derivados', () => {
  it('reconstrói childrenByParentId quando o realtime insere uma subtarefa', () => {
    const store = useTaskStore.getState();
    store.applyTaskUpsertFromDb(makeRow({ id: 'pai' }));
    store.applyTaskUpsertFromDb(makeRow({ id: 'filha', parent_id: 'pai' }));

    expect(useTaskStore.getState().childrenByParentId['pai']?.map((t) => t.id)).toEqual(['filha']);
  });

  it('remove a subtarefa do índice quando ela é apagada', () => {
    const store = useTaskStore.getState();
    store.applyTaskUpsertFromDb(makeRow({ id: 'pai' }));
    store.applyTaskUpsertFromDb(makeRow({ id: 'filha', parent_id: 'pai' }));
    store.applyTaskDelete('filha');

    expect(useTaskStore.getState().childrenByParentId['pai'] ?? []).toEqual([]);
  });

  it('mantém o índice em dia quando a subtarefa troca de pai', () => {
    const store = useTaskStore.getState();
    store.applyTaskUpsertFromDb(makeRow({ id: 'pai-a' }));
    store.applyTaskUpsertFromDb(makeRow({ id: 'pai-b' }));
    store.applyTaskUpsertFromDb(makeRow({ id: 'filha', parent_id: 'pai-a' }));
    store.applyTaskUpsertFromDb(makeRow({ id: 'filha', parent_id: 'pai-b' }));

    const { childrenByParentId } = useTaskStore.getState();
    expect(childrenByParentId['pai-a'] ?? []).toEqual([]);
    expect(childrenByParentId['pai-b']?.map((t) => t.id)).toEqual(['filha']);
  });
});

describe('applyTaskUpsertFromDb', () => {
  it('trata uma linha com deleted_at como remoção', () => {
    const store = useTaskStore.getState();
    store.applyTaskUpsertFromDb(makeRow({ id: 't1' }));
    expect(useTaskStore.getState().tasks).toHaveLength(1);

    store.applyTaskUpsertFromDb(makeRow({ id: 't1', deleted_at: '2026-08-26T13:00:00Z' }));
    expect(useTaskStore.getState().tasks).toHaveLength(0);
  });

  it('não sobrescreve uma linha otimista ainda não confirmada', () => {
    useTaskStore.setState({
      ...EMPTY,
      tasks: [makeTask({ id: 'temp-1', title: 'Título local', pending: true })],
      childrenByParentId: {},
    });

    useTaskStore.getState().applyTaskUpsertFromDb(
      makeRow({ id: 'temp-1', title: 'Título vindo do servidor' })
    );

    const [task] = useTaskStore.getState().tasks;
    expect(task.title).toBe('Título local');
    expect(task.pending).toBe(true);
  });

  it('preserva assignees e labels quando o payload do realtime não os traz', () => {
    useTaskStore.setState({
      ...EMPTY,
      tasks: [makeTask({ id: 't1', labels: ['l1'], assigneeIds: ['u1'], informedIds: ['u2'] })],
    });

    // UPDATE de tasks não carrega as tabelas relacionadas.
    useTaskStore.getState().applyTaskUpsertFromDb({
      id: 't1',
      title: 'Novo título',
      completed: false,
      priority: 1,
      created_at: '2026-08-26T12:00:00Z',
      deleted_at: null,
    });

    const [task] = useTaskStore.getState().tasks;
    expect(task.title).toBe('Novo título');
    expect(task.priority).toBe(1);
    expect(task.labels).toEqual(['l1']);
    expect(task.assigneeIds).toEqual(['u1']);
    expect(task.informedIds).toEqual(['u2']);
  });
});

describe('clearUserScopedTaskState', () => {
  it('descarta as linhas otimistas do usuário anterior', () => {
    useTaskStore.setState({
      ...EMPTY,
      tasks: [
        makeTask({ id: 'confirmada' }),
        makeTask({ id: 'temp-1', pending: true }),
      ],
    });

    clearUserScopedTaskState();

    expect(useTaskStore.getState().tasks.map((t) => t.id)).toEqual(['confirmada']);
  });

  it('recalcula os índices derivados ao descartar uma subtarefa otimista', () => {
    const store = useTaskStore.getState();
    store.applyTaskUpsertFromDb(makeRow({ id: 'pai' }));
    useTaskStore.setState((state) => ({
      tasks: [...state.tasks, makeTask({ id: 'temp-filha', parentId: 'pai', pending: true })],
    }));
    // Estado de partida: o índice enxerga a subtarefa otimista.
    useTaskStore.getState().applyTaskUpsertFromDb(makeRow({ id: 'pai' }));
    expect(useTaskStore.getState().childrenByParentId['pai']?.map((t) => t.id)).toEqual([
      'temp-filha',
    ]);

    clearUserScopedTaskState();

    // A linha some de `tasks`; o índice não pode continuar apontando para ela,
    // senão o TaskItem do pai renderiza uma subtarefa fantasma.
    expect(useTaskStore.getState().tasks.map((t) => t.id)).toEqual(['pai']);
    expect(useTaskStore.getState().childrenByParentId['pai'] ?? []).toEqual([]);
  });
});
