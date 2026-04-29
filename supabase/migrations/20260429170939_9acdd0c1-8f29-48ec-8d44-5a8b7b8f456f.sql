-- 1) Remove sync_paused_at (não é mais necessário)
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS sync_paused_at;

-- 2) Adiciona last_seen_at em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;

-- 3) Função RPC para o frontend atualizar last_seen_at do próprio usuário
CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET last_seen_at = now()
  WHERE user_id = auth.uid();
END;
$$;