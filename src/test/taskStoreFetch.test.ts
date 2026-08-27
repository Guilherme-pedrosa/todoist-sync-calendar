import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regressão: a carga `hot` precisa trazer TODAS as séries recorrentes.
 *
 * A Agenda expande as ocorrências a partir da série, ancorada em `due_date` —
 * a data de INÍCIO, que costuma ser de meses atrás. E as ocorrências já
 * concluídas (recurring_completions) só são desenhadas se a série-mãe estiver
 * no store. Sem `recurrence_rule.not.is.null` no filtro, uma série antiga ou
 * concluída fica de fora e as repetições somem da Agenda.
 */

const orCalls: string[] = [];
/** Quantas vezes a tabela `tasks` foi consultada (1 por fetch). */
let tasksQueryCount = 0;

function makeTasksQuery() {
  tasksQueryCount += 1;
  const q: any = {
    select: () => q,
    is: () => q,
    or: (expr: string) => {
      orCalls.push(expr);
      return q;
    },
    order: () => q,
    range: () => Promise.resolve({ data: [], error: null }),
  };
  return q;
}

function makeSimpleQuery(rows: unknown[] = []) {
  const q: any = {
    select: () => q,
    eq: () => q,
    order: () => Promise.resolve({ data: rows, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
  };
  return q;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }),
      getSession: vi.fn(),
      refreshSession: vi.fn(),
      signOut: vi.fn(),
    },
    from: (table: string) => (table === 'tasks' ? makeTasksQuery() : makeSimpleQuery()),
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useTaskStore } from '@/store/taskStore';

beforeEach(() => {
  orCalls.length = 0;
  tasksQueryCount = 0;
  vi.useFakeTimers();
  // Sem isto, o setTimeout da fase 2 agendado pelos testes anteriores continua
  // pendente e dispara no advanceTimersByTime de um teste seguinte, inflando a
  // contagem e fazendo o teste passar por engano.
  vi.clearAllTimers();
  useTaskStore.setState({
    tasks: [],
    projects: [],
    labels: [],
    sections: [],
    childrenByParentId: {},
    projectById: {},
    labelById: {},
    fullLoaded: false,
    loading: true,
  } as never);
});

describe('fetchData({ scope: "hot" })', () => {
  it('inclui as séries recorrentes no filtro, mesmo antigas ou concluídas', async () => {
    await useTaskStore.getState().fetchData({ scope: 'hot' });

    expect(orCalls).toHaveLength(1);
    expect(orCalls[0]).toContain('recurrence_rule.not.is.null');
  });

  it('mantém os demais critérios da janela quente', async () => {
    await useTaskStore.getState().fetchData({ scope: 'hot' });

    const expr = orCalls[0];
    expect(expr).toContain('completed.eq.false');
    expect(expr).toContain('completed_at.gte.');
    expect(expr).toContain('due_date.gte.');
    expect(expr).toContain('due_date.lte.');
  });

  it('não aplica filtro nenhum no escopo full', async () => {
    await useTaskStore.getState().fetchData({ scope: 'full' });

    expect(orCalls).toHaveLength(0);
  });

  it('agenda a carga completa mesmo com economia de dados ligada', async () => {
    // saveData ligado não pode cancelar a fase 2: sem o store completo, a
    // Agenda perde recorrências e o ChatNotifier engole notificações.
    // Contamos idas à tabela em vez de espionar o método: o zustand troca o
    // objeto de estado a cada set(), então um spy instalado antes se perde no
    // primeiro set de dentro do próprio fetchData e o teste passa por engano.
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    });

    await useTaskStore.getState().fetchData({ scope: 'hot' });
    expect(tasksQueryCount).toBe(1);

    await vi.advanceTimersByTimeAsync(11_000);

    expect(tasksQueryCount).toBe(2);
    expect(orCalls).toHaveLength(1); // a 2a ida é o full, sem filtro
    Reflect.deleteProperty(navigator, 'connection');
  });
});
