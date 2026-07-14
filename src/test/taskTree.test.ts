import { describe, expect, it } from 'vitest';
import { collectTaskDescendants } from '@/lib/taskTree';

describe('collectTaskDescendants', () => {
  it('inclui filhos, netos e níveis mais profundos', () => {
    const tasks = [
      { id: 'root', parentId: null },
      { id: 'child', parentId: 'root' },
      { id: 'grandchild', parentId: 'child' },
      { id: 'other', parentId: null },
    ];

    expect(collectTaskDescendants(tasks, 'root').map((task) => task.id)).toEqual([
      'child',
      'grandchild',
    ]);
  });

  it('não entra em loop quando os dados contêm um ciclo', () => {
    const tasks = [
      { id: 'child', parentId: 'root' },
      { id: 'root', parentId: 'child' },
    ];

    expect(collectTaskDescendants(tasks, 'root').map((task) => task.id)).toEqual(['child']);
  });
});
