import { useEffect, useState } from 'react';

/**
 * Persists "show completed tasks" toggle per view in localStorage.
 * Default: hidden. Completed tasks should be archived to the "Concluídas" page.
 */
export function useShowCompleted(viewKey: string): [boolean, (v: boolean) => void] {
  const storageKey = `taskflow.showCompleted.${viewKey}`;
  const [show, setShow] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(storageKey) === '1';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, show ? '1' : '0');
    } catch {
      // ignore
    }
  }, [show, storageKey]);

  return [show, setShow];
}
