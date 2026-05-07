SELECT public.run_activity_aggregate(d::date)
FROM generate_series(
  (now() AT TIME ZONE 'America/Sao_Paulo')::date - 6,
  (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  interval '1 day'
) AS g(d);