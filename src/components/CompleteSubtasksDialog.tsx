import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useCompleteSubtasksStore } from '@/store/completeSubtasksStore';

export function CompleteSubtasksDialog() {
  const pending = useCompleteSubtasksStore((s) => s.pending);
  const resolve = useCompleteSubtasksStore((s) => s.resolve);

  if (!pending) return null;

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o) resolve(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Concluir subtarefas também?</AlertDialogTitle>
          <AlertDialogDescription>
            “{pending.taskTitle}” ainda tem {pending.count} subtarefa
            {pending.count > 1 ? 's' : ''} em aberto. Quer concluir junto?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={() => resolve(null)}>Cancelar</AlertDialogCancel>
          <Button variant="outline" onClick={() => resolve(false)}>
            Só a principal
          </Button>
          <AlertDialogAction onClick={() => resolve(true)}>
            Concluir todas
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
