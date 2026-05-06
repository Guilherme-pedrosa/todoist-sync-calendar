import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Filter as FilterIcon, Plus, Menu, Trash2, Star } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Filter } from '@/types/task';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function FiltersIndexPage() {
  const { user } = useAuth();
  const toggleSidebar = useTaskStore((s) => s.toggleSidebar);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');

  const reload = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('filters')
      .select('*')
      .eq('user_id', user.id)
      .order('position');
    if (data) {
      setFilters(
        data.map((f: any) => ({
          id: f.id,
          name: f.name,
          query: f.query,
          color: f.color,
          isFavorite: f.is_favorite,
          position: f.position,
        }))
      );
    }
  };

  useEffect(() => {
    reload();
  }, [user]);

  const handleCreate = async () => {
    if (!user || !name.trim() || !query.trim()) return;
    const { error } = await supabase.from('filters').insert({
      user_id: user.id,
      name: name.trim(),
      query: query.trim(),
      color: 'hsl(220, 10%, 50%)',
    });
    if (error) {
      toast.error('Falha ao criar filtro');
      return;
    }
    toast.success('Filtro criado');
    setName('');
    setQuery('');
    setOpen(false);
    reload();
  };

  const handleDelete = async (id: string, n: string) => {
    if (!confirm(`Excluir filtro "${n}"?`)) return;
    await supabase.from('filters').delete().eq('id', id);
    toast.success('Filtro removido');
    reload();
  };

  const toggleFavorite = async (f: Filter) => {
    await supabase
      .from('filters')
      .update({ is_favorite: !f.isFavorite })
      .eq('id', f.id);
    reload();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-3 px-6 py-5 border-b border-border/50">
        <button
          onClick={toggleSidebar}
          className="hidden lg:inline-flex p-1.5 rounded-md hover:bg-muted transition-colors"
          aria-label="Alternar barra lateral"
        >
          <Menu className="h-5 w-5" />
        </button>
        <FilterIcon className="h-5 w-5" />
        <h2 className="font-display text-xl font-bold tracking-tight">Filtros</h2>
        <span className="text-sm text-muted-foreground ml-1">{filters.length}</span>
        <Button size="sm" className="ml-auto h-8" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Novo
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4">
        <div className="mb-4 p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground max-w-3xl">
          <strong className="text-foreground">Sintaxe:</strong>{' '}
          <code className="px-1 rounded bg-card">today</code>,{' '}
          <code className="px-1 rounded bg-card">overdue</code>,{' '}
          <code className="px-1 rounded bg-card">no date</code>,{' '}
          <code className="px-1 rounded bg-card">p1..p4</code>,{' '}
          <code className="px-1 rounded bg-card">@etiqueta</code>,{' '}
          <code className="px-1 rounded bg-card">#projeto</code>. Combine com{' '}
          <code className="px-1 rounded bg-card">&amp;</code> (e) ou{' '}
          <code className="px-1 rounded bg-card">|</code> (ou). Ex.:{' '}
          <code className="px-1 rounded bg-card">p1 &amp; today | overdue</code>.
        </div>

        {filters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <FilterIcon className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Nenhum filtro criado
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl">
            {filters.map((f) => (
              <div
                key={f.id}
                className="group flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
              >
                <Link to={`/filters/${f.id}`} className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{f.name}</div>
                  <code className="text-[11px] text-muted-foreground truncate block mt-0.5">
                    {f.query}
                  </code>
                </Link>
                <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => toggleFavorite(f)}
                    className="p-1.5 rounded hover:bg-muted"
                    aria-label="Favoritar"
                  >
                    <Star
                      className={cn(
                        'h-3.5 w-3.5',
                        f.isFavorite ? 'fill-warning text-warning' : 'text-muted-foreground'
                      )}
                    />
                  </button>
                  <button
                    onClick={() => handleDelete(f.id, f.name)}
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
            <DialogTitle>Novo filtro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nome</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='Ex.: "Urgentes de hoje"'
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Consulta</label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="p1 & today"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim() || !query.trim()}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
