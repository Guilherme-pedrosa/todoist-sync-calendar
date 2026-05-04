-- Adicionar configurações para múltiplos lembretes e aviso de atraso
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS reminder_offsets jsonb NOT NULL DEFAULT '[15]'::jsonb,
  ADD COLUMN IF NOT EXISTS notify_overdue boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_at_due_time boolean NOT NULL DEFAULT true;

-- Garantir que push_subscriptions tem unique por endpoint para upsert
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_unique
  ON public.push_subscriptions(endpoint);