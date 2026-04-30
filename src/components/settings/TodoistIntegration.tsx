import { useEffect, useState } from 'react';
import { Loader2, Check, Trash2, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function TodoistIntegration() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('user_integrations')
        .select('access_token')
        .eq('user_id', user.id)
        .eq('provider', 'todoist')
        .maybeSingle();
      if (!active) return;
      if (data?.access_token) {
        setHasToken(true);
        setToken(data.access_token);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const save = async () => {
    if (!user) return;
    const trimmed = token.trim();
    if (!trimmed) {
      toast.error('Cole seu token do Todoist');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_integrations')
        .upsert(
          { user_id: user.id, provider: 'todoist', access_token: trimmed },
          { onConflict: 'user_id,provider' }
        );
      if (error) throw error;
      setHasToken(true);
      toast.success('Token do Todoist salvo');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!user) return;
    setRemoving(true);
    try {
      const { error } = await supabase
        .from('user_integrations')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', 'todoist');
      if (error) throw error;
      setToken('');
      setHasToken(false);
      toast.success('Token removido');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao remover');
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2">
            Todoist
            {hasToken && (
              <span className="inline-flex items-center gap-1 text-xs text-success font-normal">
                <Check className="h-3 w-3" /> conectado
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cole seu API token pessoal do Todoist para importar suas tarefas.
          </p>
        </div>
        <a
          href="https://app.todoist.com/app/settings/integrations/developer"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary inline-flex items-center gap-1 hover:underline shrink-0"
        >
          Pegar token <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={show ? 'text' : 'password'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Cole seu token aqui"
            className="pr-9 font-mono text-xs"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button onClick={save} disabled={saving} size="sm">
          {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          {hasToken ? 'Atualizar' : 'Salvar'}
        </Button>
        {hasToken && (
          <Button
            onClick={remove}
            disabled={removing}
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
          >
            {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Cada usuário usa o seu próprio token — assim os dados importados são da conta de cada um.
      </p>
    </div>
  );
}
