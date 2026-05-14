ALTER TABLE public.gc_daily_activity
  ADD COLUMN IF NOT EXISTS entrada_notas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS separacao_pecas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entrega_pecas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tratativa_incorreta integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cadastro_produto integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS abertura_os integer NOT NULL DEFAULT 0;