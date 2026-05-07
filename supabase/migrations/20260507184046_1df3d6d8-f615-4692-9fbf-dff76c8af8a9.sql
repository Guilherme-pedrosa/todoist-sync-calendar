SELECT p.display_name, p.email, w.name AS workspace,
       das.tasks_completed,
       das.tasks_completed_with_project,
       das.tasks_completed_inbox,
       das.online_seconds,
       das.computed_at
FROM public.daily_activity_stats das
JOIN public.profiles p ON p.user_id = das.user_id
JOIN public.workspaces w ON w.id = das.workspace_id
WHERE das.day = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  AND w.name = 'WEDO'
ORDER BY das.tasks_completed DESC, das.online_seconds DESC;