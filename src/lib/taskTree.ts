type TaskNode = {
  id: string;
  parentId?: string | null;
};

/** Coleta todos os níveis abaixo de uma tarefa e se protege contra ciclos. */
export function collectTaskDescendants<T extends TaskNode>(tasks: T[], rootId: string): T[] {
  const byParent = new Map<string, T[]>();
  for (const task of tasks) {
    if (!task.parentId) continue;
    const children = byParent.get(task.parentId) ?? [];
    children.push(task);
    byParent.set(task.parentId, children);
  }

  const descendants: T[] = [];
  const seen = new Set<string>([rootId]);
  const queue = [rootId];

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const child of byParent.get(parentId) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      descendants.push(child);
      queue.push(child.id);
    }
  }

  return descendants;
}
