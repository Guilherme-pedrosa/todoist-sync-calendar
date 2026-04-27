import { useEffect, useState } from 'react';

const PREFIX = 'taskflow.viewmode.';

export type ViewMode = 'list' | 'kanban';
export type KanbanGroupBy = 'priority' | 'project' | 'label' | 'section' | 'date' | 'status';

export interface ViewPref {
  mode: ViewMode;
  groupBy: KanbanGroupBy;
}

export function useViewPref(
  key: string,
  defaults: ViewPref = { mode: 'list', groupBy: 'priority' }
) {
  const storageKey = PREFIX + key;
  const [pref, setPref] = useState<ViewPref>(() => {
    if (typeof window === 'undefined') return defaults;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return defaults;
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(pref));
    } catch {
      // ignore
    }
  }, [storageKey, pref]);

  return [pref, setPref] as const;
}
