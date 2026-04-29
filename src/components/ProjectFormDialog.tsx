import { useEffect, useMemo, useState } from 'react';
import { Check, List, LayoutGrid, Star } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TODOIST_COLORS, DEFAULT_PROJECT_COLOR } from '@/constants/colors';
import { useTaskStore } from '@/store/taskStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { Project } from '@/types/task';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing project. If null/undefined, it's a "create" flow. */
  project?: Project | null;
  /** Optional default parent (for "+ Add sub-project" actions). */
  defaultParentId?: string | null;
  onCreated?: (project: Project) => void;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  defaultParentId = null,
  onCreated,
}: ProjectFormDialogProps) {
  const projects = useTaskStore((s) => s.projects);
  const addProject = useTaskStore((s) => s.addProject);
  const updateProject = useTaskStore((s) => s.updateProject);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  const isEdit = !!project;
  const canMoveWorkspace = isEdit && !project?.isInbox && workspaces.length > 1;

  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_PROJECT_COLOR);
  const [parentId, setParentId] = useState<string | null>(null);
  const [viewType, setViewType] = useState<'list' | 'board'>('list');
  const [isFavorite, setIsFavorite] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const originalWorkspaceId = project?.workspaceId ?? null;
  const workspaceChanged = isEdit && workspaceId && workspaceId !== originalWorkspaceId;

  // Reset state when opening
  useEffect(() => {
    if (!open) return;
    if (project) {
      setName(project.name);
      setColor(project.color);
      setParentId(project.parentId ?? null);
      setViewType(project.viewType ?? 'list');
      setIsFavorite(!!project.isFavorite);
      setWorkspaceId(project.workspaceId ?? null);
    } else {
      setName('');
      setColor(DEFAULT_PROJECT_COLOR);
      setParentId(defaultParentId);
      setViewType('list');
      setIsFavorite(false);
      setWorkspaceId(null);
    }
  }, [open, project, defaultParentId]);

  // Possible parents = non-inbox, non-self, no cycles, and depth < 3
  const parentOptions = useMemo(() => {
    const depthOf = (id: string | null | undefined): number => {
      let d = 0;
      let cur = id ? projects.find((p) => p.id === id) : undefined;
      while (cur?.parentId) {
        d++;
        cur = projects.find((p) => p.id === cur!.parentId);
        if (d > 5) break;
      }
      return d;
    };
    return projects
      .filter((p) => !p.isInbox && p.id !== project?.id)
      .filter((p) => {
        // prevent cycles when editing
        if (!project) return true;
        let cur: Project | undefined = p;
        while (cur?.parentId) {
          if (cur.parentId === project.id) return false;
          cur = projects.find((x) => x.id === cur!.parentId);
        }
        return true;
      })
      .filter((p) => depthOf(p.id) < 2); // root=0, child=1, grandchild=2 (max 3 levels)
  }, [projects, project]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      if (isEdit && project) {
        const updates: Partial<Project> = {
          name: trimmed,
          color,
          viewType,
          isFavorite,
        };
        if (workspaceChanged) {
          // Ao mover de workspace, o projeto vira raiz no destino (parentId pode não existir lá)
          updates.workspaceId = workspaceId;
        } else {
          updates.parentId = parentId;
        }
        await updateProject(project.id, updates);
        toast.success(
          workspaceChanged
            ? `Projeto "${trimmed}" movido`
            : `Projeto "${trimmed}" atualizado`
        );
      } else {
        const created = await addProject({
          name: trimmed,
          color,
          parentId,
          viewType,
          isFavorite,
        });
        if (created) {
          toast.success(`Projeto "${trimmed}" criado`);
          onCreated?.(created);
        }
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar projeto');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar projeto' : 'Adicionar projeto'}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? 'Edite as informações do projeto.' : 'Crie um novo projeto.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="project-name" className="text-xs font-semibold text-muted-foreground">
              Nome
            </Label>
            <Input
              id="project-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) handleSubmit();
              }}
              placeholder="Ex.: Trabalho"
              maxLength={120}
            />
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">Cor</Label>
            <div className="grid grid-cols-10 gap-1.5">
              {TODOIST_COLORS.map((c) => {
                const selected = c.hsl === color;
                return (
                  <button
                    key={c.name}
                    type="button"
                    title={c.label}
                    aria-label={`Cor ${c.label}`}
                    onClick={() => setColor(c.hsl)}
                    className={cn(
                      'h-6 w-6 rounded-full flex items-center justify-center transition-transform hover:scale-110',
                      selected && 'ring-2 ring-offset-2 ring-offset-background ring-foreground'
                    )}
                    style={{ backgroundColor: c.hsl }}
                  >
                    {selected && <Check className="h-3.5 w-3.5 text-white drop-shadow" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Parent project */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Projeto pai</Label>
            <Select
              value={parentId ?? '__root__'}
              onValueChange={(v) => setParentId(v === '__root__' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Nenhum (projeto raiz)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__root__">Nenhum (projeto raiz)</SelectItem>
                {parentOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Workspace (apenas em edição, com mais de 1 workspace) */}
          {canMoveWorkspace && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Workspace</Label>
              <Select
                value={workspaceId ?? ''}
                onValueChange={(v) => setWorkspaceId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      <span className="inline-flex items-center gap-2">
                        {w.name}
                        {w.isPersonal && (
                          <span className="text-[10px] text-muted-foreground">(pessoal)</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {workspaceChanged && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-amber-700 dark:text-amber-300">
                    Ao mover, o projeto vira <strong>privado</strong>, fica como{' '}
                    <strong>raiz</strong> e os membros/times atuais perdem acesso. As tarefas vão
                    junto.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* View type */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Visualização</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setViewType('list')}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors',
                  viewType === 'list'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted'
                )}
              >
                <List className="h-4 w-4" />
                Lista
              </button>
              <button
                type="button"
                onClick={() => setViewType('board')}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors',
                  viewType === 'board'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted'
                )}
              >
                <LayoutGrid className="h-4 w-4" />
                Quadro
              </button>
            </div>
          </div>

          {/* Favorite */}
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
            <span className="inline-flex items-center gap-2 text-sm">
              <Star className="h-4 w-4 text-muted-foreground" />
              Adicionar aos favoritos
            </span>
            <Switch checked={isFavorite} onCheckedChange={setIsFavorite} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || submitting}>
            {isEdit ? 'Salvar' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
