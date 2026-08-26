create or replace function public.replace_gc_daily_activity(p_start date, p_end date, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.gc_daily_activity where day >= p_start and day <= p_end;

  insert into public.gc_daily_activity (
    day, gc_user_id, gc_user_name,
    vendas_count, vendas_valor, os_count, os_valor,
    orcamentos_count, orcamentos_valor, nfs_count, nfs_valor,
    entrada_notas, separacao_pecas, entrega_pecas,
    tratativa_incorreta, cadastro_produto, abertura_os, abertura_compras,
    computed_at
  )
  select
    (r->>'day')::date,
    r->>'gc_user_id',
    coalesce(r->>'gc_user_name', 'Sem nome'),
    coalesce((r->>'vendas_count')::int, 0),
    coalesce((r->>'vendas_valor')::numeric, 0),
    coalesce((r->>'os_count')::int, 0),
    coalesce((r->>'os_valor')::numeric, 0),
    coalesce((r->>'orcamentos_count')::int, 0),
    coalesce((r->>'orcamentos_valor')::numeric, 0),
    coalesce((r->>'nfs_count')::int, 0),
    coalesce((r->>'nfs_valor')::numeric, 0),
    coalesce((r->>'entrada_notas')::int, 0),
    coalesce((r->>'separacao_pecas')::int, 0),
    coalesce((r->>'entrega_pecas')::int, 0),
    coalesce((r->>'tratativa_incorreta')::int, 0),
    coalesce((r->>'cadastro_produto')::int, 0),
    coalesce((r->>'abertura_os')::int, 0),
    coalesce((r->>'abertura_compras')::int, 0),
    coalesce((r->>'computed_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r
  where (r->>'day') is not null and (r->>'gc_user_id') is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_gc_daily_activity(date, date, jsonb) from public, anon, authenticated;
grant execute on function public.replace_gc_daily_activity(date, date, jsonb) to service_role;