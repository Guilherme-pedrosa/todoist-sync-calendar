import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag, Plus, Menu, Star, Trash2, Edit3 } from 'lucide-react';
import { useTaskStore } from '@/store/taskStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LABEL_COLORS } from '@/constants/colors';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function LabelsIndexPage() {
  const labels = useTaskStore((s) => s.labels);
  const tasks = useTaskStore((s) => s.tasks);
  const addLabel = useTaskStore((s) => s.addLabel);
  const deleteLabel = useTaskStore((s) => s.deleteLabel);
  const toggleLabelFavorite = useTaskStore((s) => s.toggleLabelFavorite);
  const toggleSidebar = useTaskStore((s) => s.toggleSidebar);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(LABEL_COLORS[0]?.value || 'hsl(0, 72%, 51%)');

  const taskCountByLabel = (id: string) =>
    tasks.filter((t) => !t.completed && t.labels.includes(id)).length;

  const handleCreate = async () => {
    if (!name.trim()) return;
    await addLabel({ name: name.trim(), color });
    toast.success('Etiqueta criada');
    setName('');
    setOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-3 px-6 py-5 border-b border-border/50">
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-1.5 rounded-md hover:bg-muted transition-colors"
          aria-label="Alternar barra lateral"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Tag className="h-5 w-5" />
        <h2 className="font-display text-xl font-bold tracking-tight">Etiquetas</h2>
        <span className="text-sm text-muted-foreground ml-1">{labels.length}</span>
        <Button
          size="sm"
          className="ml-auto h-8"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Nova
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4">
        {labels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Tag className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Nenhuma etiqueta ainda
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Use etiquetas para organizar tarefas entre projetos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl">
            {labels.map((l) => (
              <div
                key={l.id}
                className="group flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
              >
                <Link
                  to={`/labels/${l.id}`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${l.color}20` }}
                  >
                    <Tag className="h-4 w-4" style={{ color: l.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{l.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {taskCountByLabel(l.id)} tarefa
                      {taskCountByLabel(l.id) !== 1 ? 's' : ''}
                    </div>
                  </div>
                </Link>
                <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => toggleLabelFavorite(l.id)}
                    className="p-1.5 rounded hover:bg-muted"
                    aria-label="Favoritar"
                  >
                    <Star
                      className={cn(
                        'h-3.5 w-3.5',
                        l.isFavorite ? 'fill-warning text-warning' : 'text-muted-foreground'
                      )}
                    />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Excluir etiqueta "${l.name}"?`)) {
                        deleteLabel(l.id);
                        toast.success('Etiqueta removida');
                      }
                    }}
                    className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                    aria-label="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova etiqueta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Nome
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Urgente"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Cor
              </label>
              <div className="flex flex-wrap gap-2 mt-2">
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setColor(c.value)}
                    className={cn(
                      'h-7 w-7 rounded-full border-2 transition-transform',
                      color === c.value
                        ? 'border-foreground scale-110'
                        : 'border-transparent hover:scale-105'
                    )}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim()}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
