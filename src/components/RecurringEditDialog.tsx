import { useRecurringEditStore } from '@/store/recurringEditStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Repeat } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Asks the user whether a change to a recurring task should apply to
 * just this occurrence or to the whole series. Mounted once at app root.
 */
export function RecurringEditDialog() {
  const pending = useRecurringEditStore((s) => s.pending);
  const resolve = useRecurringEditStore((s) => s.resolve);

  const open = !!pending;
  const isDelete = pending?.operation === 'delete';
  const weekdayLabel = pending?.occurrenceDate
    ? format(parseISO(`${pending.occurrenceDate}T12:00:00`), 'EEEE', { locale: ptBR })
    : 'dia da semana';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resolve(null);
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-primary" />
            {isDelete ? 'Excluir tarefa recorrente' : 'Editar tarefa recorrente'}
          </DialogTitle>
          <DialogDescription>
            {isDelete
              ? 'Esta tarefa se repete. Escolha exatamente o que deve ser removido.'
              : `${pending?.changeLabel ? `Você está alterando: ${pending.changeLabel}.` : 'Esta tarefa se repete.'} Você quer aplicar a mudança apenas a esta ocorrência ou a toda a série?`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="ghost" onClick={() => resolve(null)}>
            Cancelar
          </Button>
          <Button variant="outline" onClick={() => resolve('single')}>
            {isDelete ? 'Só este evento' : 'Apenas esta'}
          </Button>
          {isDelete && (
            <Button variant="outline" onClick={() => resolve('weekday')}>
              Todas de {weekdayLabel}
            </Button>
          )}
          <Button variant={isDelete ? 'destructive' : 'default'} onClick={() => resolve('series')}>
            Toda a série
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
