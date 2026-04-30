import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, Loader2, Trash2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export function ProfileSettings() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const isOAuthOnly = !!user && Array.isArray((user as any)?.identities)
    && (user as any).identities.length > 0
    && !(user as any).identities.some((i: any) => i.provider === 'email');

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setDisplayName(data?.display_name ?? (user as any)?.user_metadata?.full_name ?? '');
        setAvatarUrl(data?.avatar_url ?? (user as any)?.user_metadata?.avatar_url ?? null);
      });
  }, [user]);

  const initials = (displayName || user?.email || '?').slice(0, 2).toUpperCase();

  const handleFile = async (file: File) => {
    if (!user) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error('Use PNG, JPG, WEBP ou GIF');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Imagem precisa ter até 5MB');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${pub.publicUrl}?t=${Date.now()}`;

      const { error: profErr } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('user_id', user.id);
      if (profErr) throw profErr;

      await supabase.auth.updateUser({ data: { avatar_url: url } });
      setAvatarUrl(url);
      toast.success('Foto atualizada');
    } catch (e: any) {
      toast.error(e.message ?? 'Falha ao enviar imagem');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!user) return;
    setUploading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('user_id', user.id);
      if (error) throw error;
      await supabase.auth.updateUser({ data: { avatar_url: null } });
      setAvatarUrl(null);
      toast.success('Foto removida');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveName = async () => {
    if (!user) return;
    if (!displayName.trim()) {
      toast.error('Nome não pode ficar vazio');
      return;
    }
    setSavingName(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() })
        .eq('user_id', user.id);
      if (error) throw error;
      await supabase.auth.updateUser({ data: { full_name: displayName.trim() } });
      toast.success('Nome atualizado');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingName(false);
    }
  };

  const handleSavePassword = async () => {
    if (newPassword.length < 8) {
      toast.error('A senha precisa ter no mínimo 8 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      toast.success(
        isOAuthOnly
          ? 'Senha criada! Agora você pode entrar com e-mail e senha.'
          : 'Senha atualizada com sucesso'
      );
    } catch (e: any) {
      toast.error(e.message ?? 'Falha ao atualizar senha');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar className="h-20 w-20">
          <AvatarImage src={avatarUrl ?? undefined} alt={displayName} />
          <AvatarFallback className="text-xl bg-primary/15 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED.join(',')}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Camera className="h-4 w-4 mr-1.5" />
              )}
              {avatarUrl ? 'Trocar foto' : 'Enviar foto'}
            </Button>
            {avatarUrl && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRemove}
                disabled={uploading}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Remover
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPG, WEBP ou GIF · até 5MB</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Nome</label>
        <div className="flex gap-2">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Seu nome"
          />
          <Button onClick={handleSaveName} disabled={savingName}>
            {savingName && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">E-mail</label>
        <Input value={user?.email ?? ''} disabled className="bg-muted/40" />
      </div>

      <div className="border-t border-border pt-5 space-y-3">
        <div className="flex items-start gap-2">
          <KeyRound className="h-4 w-4 text-primary mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium">
              {isOAuthOnly ? 'Criar senha de acesso' : 'Trocar senha'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isOAuthOnly
                ? 'Você entrou com Google. Defina uma senha para também poder entrar com e-mail/senha — funciona melhor no app instalado no iPhone.'
                : 'Defina uma nova senha. Você sairá das outras sessões.'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Nova senha (mín. 8 caracteres)</label>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              autoComplete="new-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Confirmar senha</label>
          <Input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <Button
          onClick={handleSavePassword}
          disabled={savingPassword || !newPassword || !confirmPassword}
          className="w-full sm:w-auto"
        >
          {savingPassword && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          {isOAuthOnly ? 'Criar senha' : 'Salvar nova senha'}
        </Button>
      </div>
    </div>
  );
}
