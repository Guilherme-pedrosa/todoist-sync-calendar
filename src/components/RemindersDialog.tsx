import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label as UiLabel } from '@/components/ui/label';
import { Bell, Plus, Trash2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

export interface ReminderItem {
  id?: string;
  type: 'relative' | 'absolute';
  relative_minutes?: number | null;
  trigger_at?: string | null; // ISO
  channel: 'push' | 'email';
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  taskId?: string | null; // when persisted
  initial?: ReminderItem[];
  onSave?: (items: ReminderItem[]) => void; // for unsaved tasks (Quick Add)
  defaultChannel?: 'push' | 'email';
  defaultMinutes?: number;
}

const PRESET_MINUTES = [0, 5, 10, 15, 30, 60, 120, 1440];

function formatRelative(min: number) {
  if (min === 0) return 'No horário';
  if (min === 1440) return '1 dia antes';
  if (min >= 60) return `${min / 60}h antes`;
  return `${min} min antes`;
}

export function RemindersDialog({
  open,
  onOpenChange,
  taskId,
  initial,
  onSave,
  defaultChannel = 'push',
  defaultMinutes = 30,
}: Props) {
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [adding, setAdding] = useState<'relative' | 'absolute' | null>(null);
  const [newMinutes, setNewMinutes] = useState<number>(defaultMinutes);
  const [newDateTime, setNewDateTime] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    if (taskId) {
      (async () => {
        const { data } = await supabase
          .from('reminders')
          .select('id,type,relative_minutes,trigger_at,channel')
          .eq('task_id', taskId);
        setItems(
          (data || []).map((r: any) => ({
            id: r.id,
            type: (r.type as 'relative' | 'absolute') || (r.relative_minutes != null ? 'relative' : 'absolute'),
            relative_minutes: r.relative_minutes,
            trigger_at: r.trigger_at,
            channel: r.channel,
          }))
        );
      })();
    } else {
      setItems(initial || []);
    }
    setAdding(null);
  }, [open, taskId, initial]);

  const addCurrent = () => {
    if (adding === 'relative') {
      setItems((prev) => [
        ...prev,
        { type: 'relative', relative_minutes: newMinutes, channel: defaultChannel },
      ]);
    } else if (adding === 'absolute' && newDateTime) {
      const iso = new Date(newDateTime).toISOString();
      setItems((prev) => [
        ...prev,
        { type: 'absolute', trigger_at: iso, channel: defaultChannel },
      ]);
    }
    setAdding(null);
    setNewDateTime('');
    setNewMinutes(defaultMinutes);
  };

  const remove = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const persist = async () => {
    if (taskId) {
      // diff: delete all and re-insert (keeps it simple + correct)
      await supabase.from('reminders').delete().eq('task_id', taskId);
      if (items.length > 0) {
        const rows = items.map((r) => ({
          task_id: taskId,
          type: r.type,
          channel: r.channel,
          relative_minutes: r.type === 'relative' ? r.relative_minutes ?? 0 : null,
          trigger_at:
            r.type === 'absolute'
              ? r.trigger_at!
              : new Date().toISOString(), // placeholder; backend should compute from due
        }));
        const { error } = await supabase.from('reminders').insert(rows);
        if (error) {
          toast.error('Falha ao salvar lembretes');
          return;
        }
      }
      toast.success('Lembretes atualizados');
    }
    onSave?.(items);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" /> Lembretes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {items.length === 0 && !adding && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum lembrete adicionado
            </p>
          )}

          {items.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border"
            >
              <div className="flex items-center gap-2 text-sm">
                {r.type === 'relative' ? (
                  <>
                    <Clock className="h-3.5 w-3.5 text-warning" />
                    {formatRelative(r.relative_minutes ?? 0)}
                  </>
                ) : (
                  <>
                    <Bell className="h-3.5 w-3.5 text-primary" />
                    {r.trigger_at ? format(new Date(r.trigger_at), 'dd/MM HH:mm') : '—'}
                  </>
                )}
                <span className="text-[10px] text-muted-foreground uppercase ml-1">
                  {r.channel}
                </span>
              </div>
              <button
                onClick={() => remove(i)}
                className="p-1 text-muted-foreground hover:text-destructive"
                aria-label="Remover"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {adding === 'relative' && (
            <div className="space-y-2 p-2 rounded-md border border-primary/30 bg-primary/5">
              <UiLabel className="text-xs">Minutos antes</UiLabel>
              <div className="flex flex-wrap gap-1">
                {PRESET_MINUTES.map((m) => (
                  <button
                    key={m}
                    onClick={() => setNewMinutes(m)}
                    className={cn(
                      'text-xs px-2 py-1 rounded border',
                      newMinutes === m
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:border-primary/40'
                    )}
                  >
                    {formatRelative(m)}
                  </button>
                ))}
              </div>
              <Input
                type="number"
                min={0}
                value={newMinutes}
                onChange={(e) => setNewMinutes(Number(e.target.value) || 0)}
                className="h-8 text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={addCurrent}>
                  Adicionar
                </Button>
              </div>
            </div>
          )}

          {adding === 'absolute' && (
            <div className="space-y-2 p-2 rounded-md border border-primary/30 bg-primary/5">
              <UiLabel className="text-xs">Data e hora</UiLabel>
              <Input
                type="datetime-local"
                value={newDateTime}
                onChange={(e) => setNewDateTime(e.target.value)}
                className="h-8 text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={addCurrent} disabled={!newDateTime}>
                  Adicionar
                </Button>
              </div>
            </div>
          )}

          {!adding && (
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setAdding('relative')}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Antes
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setAdding('absolute')}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Em horário
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={persist}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
