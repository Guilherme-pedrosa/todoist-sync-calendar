-- Mantém os agregadores internos disponíveis para cron/service_role, mas
-- impede que qualquer sessão autenticada execute manutenção privilegiada.
REVOKE ALL ON FUNCTION public.run_activity_aggregate(date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_activity_aggregate(date) TO service_role;

CREATE OR REPLACE FUNCTION public.run_activity_aggregate_admin(
  p_day date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_productivity_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito aos administradores de produtividade'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.run_activity_aggregate(p_day);
END;
$function$;

REVOKE ALL ON FUNCTION public.run_activity_aggregate_admin(date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_activity_aggregate_admin(date)
  TO authenticated;

-- Substitui um intervalo do GestãoClick em uma única transação. Se qualquer
-- linha for inválida, o DELETE e o INSERT são revertidos juntos.
CREATE OR REPLACE FUNCTION public.replace_gc_daily_activity(
  p_start date,
  p_end date,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_inserted integer := 0;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_start > p_end THEN
    RAISE EXCEPTION 'Intervalo inválido';
  END IF;

  IF p_end - p_start > 730 THEN
    RAISE EXCEPTION 'Intervalo máximo de 730 dias excedido';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows precisa ser um array JSON';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_rows) AS r(day date)
    WHERE r.day IS NULL OR r.day < p_start OR r.day > p_end
  ) THEN
    RAISE EXCEPTION 'Há linhas fora do intervalo solicitado';
  END IF;

  DELETE FROM public.gc_daily_activity
  WHERE day BETWEEN p_start AND p_end;

  INSERT INTO public.gc_daily_activity (
    day,
    gc_user_id,
    gc_user_name,
    vendas_count,
    vendas_valor,
    os_count,
    os_valor,
    orcamentos_count,
    orcamentos_valor,
    nfs_count,
    nfs_valor,
    entrada_notas,
    separacao_pecas,
    entrega_pecas,
    tratativa_incorreta,
    cadastro_produto,
    abertura_os,
    abertura_compras,
    computed_at
  )
  SELECT
    r.day,
    r.gc_user_id,
    r.gc_user_name,
    COALESCE(r.vendas_count, 0),
    COALESCE(r.vendas_valor, 0),
    COALESCE(r.os_count, 0),
    COALESCE(r.os_valor, 0),
    COALESCE(r.orcamentos_count, 0),
    COALESCE(r.orcamentos_valor, 0),
    COALESCE(r.nfs_count, 0),
    COALESCE(r.nfs_valor, 0),
    COALESCE(r.entrada_notas, 0),
    COALESCE(r.separacao_pecas, 0),
    COALESCE(r.entrega_pecas, 0),
    COALESCE(r.tratativa_incorreta, 0),
    COALESCE(r.cadastro_produto, 0),
    COALESCE(r.abertura_os, 0),
    COALESCE(r.abertura_compras, 0),
    COALESCE(r.computed_at, now())
  FROM jsonb_to_recordset(p_rows) AS r(
    day date,
    gc_user_id text,
    gc_user_name text,
    vendas_count integer,
    vendas_valor numeric,
    os_count integer,
    os_valor numeric,
    orcamentos_count integer,
    orcamentos_valor numeric,
    nfs_count integer,
    nfs_valor numeric,
    entrada_notas integer,
    separacao_pecas integer,
    entrega_pecas integer,
    tratativa_incorreta integer,
    cadastro_produto integer,
    abertura_os integer,
    abertura_compras integer,
    computed_at timestamptz
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_gc_daily_activity(date, date, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_gc_daily_activity(date, date, jsonb)
  TO service_role;

-- Funções temporárias de diagnóstico não fazem parte do produto.
REVOKE ALL ON FUNCTION public.debug_whoami()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.debug_try_insert_task(uuid)
  FROM PUBLIC, anon, authenticated;
