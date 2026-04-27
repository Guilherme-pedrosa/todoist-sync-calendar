import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';
import { useUndoStore } from '@/store/undoStore';
import { toast } from 'sonner';

function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (t.isContentEditable) return true;
  return false;
}

export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const openQuickAdd = useQuickAddStore((s) => s.openQuickAdd);
  const togglePalette = useCommandPaletteStore((s) => s.toggle);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl+Z -> Desfazer
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const action = useUndoStore.getState().pop();
        if (action) {
          Promise.resolve(action.undo())
            .then(() => toast.success(`Desfeito: ${action.label}`))
            .catch((err) => {
              console.error('Falha ao desfazer:', err);
              toast.error('Não foi possível desfazer');
            });
        } else {
          toast('Nada para desfazer');
        }
        return;
      }

      // Cmd/Ctrl+K -> Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePalette();
        return;
      }

      if (isTypingTarget(e)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'q':
          e.preventDefault();
          openQuickAdd();
          break;
        case 'i':
          e.preventDefault();
          navigate('/inbox');
          break;
        case 't':
          e.preventDefault();
          navigate('/today');
          break;
        case 'u':
          e.preventDefault();
          navigate('/upcoming');
          break;
        case 'c':
          e.preventDefault();
          navigate('/completed');
          break;
        case 's':
          e.preventDefault();
          navigate('/settings');
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, openQuickAdd, togglePalette]);
}
