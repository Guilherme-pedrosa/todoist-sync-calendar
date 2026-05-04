import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useTaskStore } from '@/store/taskStore';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Copy, KeyRound, Code2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  default_project_id: string | null;
  default_assignee_id: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export function ApiKeysPanel() {
  const { user } = useAuth();
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const members = useWorkspaceStore((s) => s.members);
  const membersWorkspaceId = useWorkspaceStore((s) => s.membersWorkspaceId);
  const fetchMembers = useWorkspaceStore((s) => s.fetchMembers);
  const projects = useTaskStore((s) => s.projects);

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    default_project_id: '',
    default_assignee_id: '',
  });
  const [revealKey, setRevealKey] = useState<string | null>(null);

  const callFn = async (body: Record<string, any>) => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error('Sem sessão');
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-keys-manage`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || 'Erro');
    return j;
  };

  const load = async () => {
    if (!currentWorkspaceId) return;
    setLoading(true);
    try {
      const j = await callFn({ action: 'list', workspace_id: currentWorkspaceId });
      setKeys(j.keys ?? []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (currentWorkspaceId && membersWorkspaceId !== currentWorkspaceId) {
      fetchMembers(currentWorkspaceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspaceId]);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error('Dê um nome à chave');
      return;
    }
    setSubmitting(true);
    try {
      const j = await callFn({
        action: 'create',
        workspace_id: currentWorkspaceId,
        name: form.name.trim(),
        default_project_id: form.default_project_id || null,
        default_assignee_id: form.default_assignee_id || null,
      });
      setRevealKey(j.key);
      setOpen(false);
      setForm({ name: '', default_project_id: '', default_assignee_id: '' });
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revogar esta chave? Sistemas que a utilizam pararão de funcionar.')) return;
    try {
      await callFn({ action: 'revoke', id });
      toast.success('Chave revogada');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? '—';

  const memberName = (id: string | null) =>
    members.find((m) => m.userId === id)?.displayName ?? '—';

  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/external-create-task`;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-lg font-semibold">Chaves de API</h3>
            <p className="text-sm text-muted-foreground">
              Permita que sistemas externos criem tarefas no seu workspace.
            </p>
          </div>
          <Button onClick={() => setOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Nova chave
          </Button>
        </div>

        <div className="border border-border rounded-lg divide-y divide-border bg-card">
          {loading && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando…
            </div>
          )}
          {!loading && keys.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma chave criada ainda.
            </div>
          )}
          {!loading &&
            keys.map((k) => (
              <div key={k.id} className="p-3 flex items-center gap-3">
                <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{k.name}</span>
                    {k.revoked_at && <Badge variant="destructive">Revogada</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    <code className="font-mono">{k.key_prefix}…</code> · Projeto: {projectName(k.default_project_id)}
                    {k.default_assignee_id && ` · Resp.: ${memberName(k.default_assignee_id)}`}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Criada {format(new Date(k.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    {k.last_used_at &&
                      ` · Último uso ${format(new Date(k.last_used_at), "dd/MM HH:mm", { locale: ptBR })}`}
                  </div>
                </div>
                {!k.revoked_at && (
                  <Button variant="ghost" size="icon" onClick={() => handleRevoke(k.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
        </div>
      </div>

      <div className="border border-border rounded-lg p-4 bg-muted/30">
        <div className="flex items-center gap-2 mb-2">
          <Code2 className="h-4 w-4" />
          <h4 className="text-sm font-semibold">Como usar</h4>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Faça um POST para o endpoint abaixo enviando a chave no header <code>x-api-key</code>.
        </p>
        <div className="bg-background rounded-md p-3 font-mono text-xs overflow-x-auto">
          <div className="text-muted-foreground">POST {endpoint}</div>
          <div className="mt-2">
            {`curl -X POST '${endpoint}' \\
  -H 'x-api-key: SUA_CHAVE_AQUI' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "title": "Trocar pneu do veículo X",
    "description": "Pneu dianteiro direito furado",
    "priority": "p2",
    "due_at": "2026-05-10T14:00:00Z"
  }'`}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Campos: <b>title</b> (obrigatório), <b>description</b>, <b>priority</b> (p1-p4 ou urgente/alta/média/baixa),
          <b> due_at</b> (ISO 8601), <b>project_id</b> (opcional, sobrescreve o padrão).
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova chave de API</DialogTitle>
            <DialogDescription>
              A chave será exibida apenas uma vez. Copie e guarde em local seguro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome da chave</Label>
              <Input
                placeholder="ex: Technician & Vehicle Hub"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Projeto padrão</Label>
              <Select
                value={form.default_project_id}
                onValueChange={(v) => setForm({ ...form, default_project_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {projects
                    .filter((p) => !p.isInbox)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Responsável padrão (opcional)</Label>
              <Select
                value={form.default_assignee_id}
                onValueChange={(v) => setForm({ ...form, default_assignee_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ninguém" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.displayName ?? m.userId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gerar chave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revealKey} onOpenChange={(v) => !v && setRevealKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sua nova chave de API</DialogTitle>
            <DialogDescription>
              Esta é a única vez que você verá a chave completa. Copie agora.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-md p-3 font-mono text-sm break-all">
            {revealKey}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(revealKey ?? '');
                toast.success('Copiado!');
              }}
            >
              <Copy className="h-4 w-4 mr-2" /> Copiar
            </Button>
            <Button variant="ghost" onClick={() => setRevealKey(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
