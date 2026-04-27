import { useCallback } from 'react';
import { toast } from 'sonner';

interface UndoOptions {
  /** Mensagem mostrada após executar a ação (ex.: "Tarefa concluída"). */
  message: string;
  /** Função executada quando o usuário clica em "Desfazer". */
  undo: () => Promise<void> | void;
  /** Duração do toast em ms (padrão 5s). */
  duration?: number;
  /** Mensagem opcional após o undo bem sucedido. */
  undoMessage?: string;
}

/**
 * Hook utilitário que mostra um toast com botão "Desfazer".
 * Uso: const undoableComplete = useUndoableAction(); undoableComplete({ ... })
 */
export function useUndoableAction() {
  return useCallback((opts: UndoOptions) => {
    toast(opts.message, {
      duration: opts.duration ?? 5000,
      action: {
        label: 'Desfazer',
        onClick: async () => {
          try {
            await opts.undo();
            if (opts.undoMessage) toast.success(opts.undoMessage);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Falha ao desfazer');
          }
        },
      },
    });
  }, []);
}
