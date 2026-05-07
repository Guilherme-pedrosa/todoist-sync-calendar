DELETE FROM public.daily_activity_stats das
WHERE das.day = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  AND das.online_seconds = 0
  AND das.active_seconds = 0
  AND das.productive_seconds = 0
  AND das.neutral_seconds = 0
  AND das.distracting_seconds = 0
  AND das.tasks_completed = 0
  AND das.sessions_count = 0
  AND COALESCE(jsonb_array_length(das.top_domains), 0) = 0
  AND das.by_project = '{}'::jsonb;