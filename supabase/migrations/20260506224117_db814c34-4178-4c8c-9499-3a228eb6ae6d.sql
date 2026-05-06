CREATE OR REPLACE FUNCTION public.run_activity_aggregate(p_day date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days date[];
  v_day date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_processed int := 0;
BEGIN
  IF p_day IS NULL THEN
    v_days := ARRAY[(current_date - 1), current_date];
  ELSE
    v_days := ARRAY[p_day];
  END IF;

  FOREACH v_day IN ARRAY v_days
  LOOP
    v_day_start := (v_day || ' 00:00:00+00')::timestamptz;
    v_day_end   := (v_day || ' 23:59:59.999+00')::timestamptz;

    WITH session_overlap AS (
      SELECT
        s.user_id,
        s.workspace_id,
        GREATEST(s.started_at, v_day_start) AS lo,
        LEAST(COALESCE(s.ended_at, s.last_seen_at), v_day_end) AS hi,
        s.active_seconds,
        s.idle_seconds,
        s.started_at,
        COALESCE(s.ended_at, s.last_seen_at) AS effective_end
      FROM public.activity_sessions s
      WHERE s.started_at <= v_day_end
        AND COALESCE(s.ended_at, s.last_seen_at) >= v_day_start
    ),
    session_agg AS (
      SELECT
        user_id,
        workspace_id,
        SUM(EXTRACT(EPOCH FROM (hi - lo)))::int AS online_seconds,
        SUM(
          (active_seconds * EXTRACT(EPOCH FROM (hi - lo)) /
           NULLIF(EXTRACT(EPOCH FROM (effective_end - started_at)), 0))::int
        )::int AS active_seconds,
        SUM(
          (idle_seconds * EXTRACT(EPOCH FROM (hi - lo)) /
           NULLIF(EXTRACT(EPOCH FROM (effective_end - started_at)), 0))::int
        )::int AS idle_seconds,
        COUNT(*)::int AS sessions_count,
        MIN(lo) AS first_seen_at,
        MAX(hi) AS last_seen_at
      FROM session_overlap
      WHERE hi > lo
      GROUP BY user_id, workspace_id
    ),
    hourly AS (
      SELECT
        user_id,
        workspace_id,
        EXTRACT(HOUR FROM ts AT TIME ZONE 'UTC')::int AS hour_bucket,
        COUNT(*)::int * 30 AS seconds_in_bucket
      FROM public.activity_heartbeats
      WHERE ts >= v_day_start AND ts <= v_day_end
        AND is_active = true
      GROUP BY user_id, workspace_id, hour_bucket
    ),
    hourly_json AS (
      SELECT
        user_id,
        workspace_id,
        jsonb_object_agg(hour_bucket::text, seconds_in_bucket) AS hourly_buckets
      FROM hourly
      GROUP BY user_id, workspace_id
    ),
    completions AS (
      SELECT
        al.user_id,
        t.workspace_id,
        t.project_id,
        p.name AS project_name,
        p.is_inbox,
        COUNT(*)::int AS qtd
      FROM public.activity_log al
      JOIN public.tasks t
        ON t.id = COALESCE((al.payload->>'task_id')::uuid, al.entity_id)
      LEFT JOIN public.projects p ON p.id = t.project_id
      WHERE al.entity_type = 'task'
        AND al.action = 'completed'
        AND al.created_at >= v_day_start
        AND al.created_at <= v_day_end
      GROUP BY al.user_id, t.workspace_id, t.project_id, p.name, p.is_inbox
    ),
    completions_agg AS (
      SELECT
        user_id,
        workspace_id,
        SUM(qtd)::int AS tasks_completed,
        (SUM(qtd) FILTER (WHERE NOT is_inbox))::int AS tasks_completed_with_project,
        (SUM(qtd) FILTER (WHERE is_inbox))::int AS tasks_completed_inbox,
        jsonb_object_agg(
          COALESCE(project_id::text, 'inbox'),
          jsonb_build_object(
            'name', COALESCE(project_name, '—'),
            'tasks', qtd,
            'seconds', 0
          )
        ) AS by_project
      FROM completions
      GROUP BY user_id, workspace_id
    ),
    visits AS (
      SELECT
        v.user_id,
        v.workspace_id,
        v.domain,
        COALESCE(dc.category, 'neutral') AS category,
        SUM(
          CASE
            WHEN v.duration_seconds > 0 THEN v.duration_seconds
            WHEN v.ended_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (v.ended_at - v.started_at))::int
            ELSE LEAST(EXTRACT(EPOCH FROM (now() - v.started_at))::int, 1800)
          END
        )::int AS seconds
      FROM public.activity_url_visits v
      LEFT JOIN public.domain_categories dc
        ON dc.workspace_id = v.workspace_id AND dc.domain = v.domain
      WHERE v.started_at >= v_day_start AND v.started_at <= v_day_end
      GROUP BY v.user_id, v.workspace_id, v.domain, dc.category
    ),
    visits_agg AS (
      SELECT
        user_id,
        workspace_id,
        (SUM(seconds) FILTER (WHERE category = 'productive'))::int AS productive_seconds,
        (SUM(seconds) FILTER (WHERE category = 'neutral'))::int AS neutral_seconds,
        (SUM(seconds) FILTER (WHERE category = 'distracting'))::int AS distracting_seconds,
        jsonb_agg(
          jsonb_build_object('domain', domain, 'seconds', seconds, 'category', category)
          ORDER BY seconds DESC
        ) FILTER (WHERE seconds > 0) AS top_domains
      FROM visits
      WHERE seconds > 0
      GROUP BY user_id, workspace_id
    ),
    final AS (
      SELECT
        sa.user_id,
        sa.workspace_id,
        v_day AS day,
        COALESCE(sa.active_seconds, 0) AS active_seconds,
        COALESCE(sa.idle_seconds, 0) AS idle_seconds,
        COALESCE(sa.online_seconds, 0) AS online_seconds,
        COALESCE(sa.sessions_count, 0) AS sessions_count,
        sa.first_seen_at,
        sa.last_seen_at,
        COALESCE(ca.tasks_completed, 0) AS tasks_completed,
        COALESCE(ca.tasks_completed_with_project, 0) AS tasks_completed_with_project,
        COALESCE(ca.tasks_completed_inbox, 0) AS tasks_completed_inbox,
        COALESCE(va.productive_seconds, 0) AS productive_seconds,
        COALESCE(va.neutral_seconds, 0) AS neutral_seconds,
        COALESCE(va.distracting_seconds, 0) AS distracting_seconds,
        COALESCE(hj.hourly_buckets, '{}'::jsonb) AS hourly_buckets,
        COALESCE(ca.by_project, '{}'::jsonb) AS by_project,
        COALESCE(va.top_domains, '[]'::jsonb) AS top_domains,
        LEAST(100, GREATEST(0,
          (50.0 * COALESCE(sa.active_seconds, 0) / NULLIF(COALESCE(sa.online_seconds, 0), 0)) +
          (30.0 * LEAST(COALESCE(ca.tasks_completed, 0), 10) / 10.0) +
          (20.0 * COALESCE(va.productive_seconds, 0) /
            NULLIF(COALESCE(va.productive_seconds, 0) + COALESCE(va.distracting_seconds, 0), 0))
        ))::int AS activity_score
      FROM session_agg sa
      LEFT JOIN completions_agg ca
        ON ca.user_id = sa.user_id AND ca.workspace_id = sa.workspace_id
      LEFT JOIN visits_agg va
        ON va.user_id = sa.user_id AND va.workspace_id = sa.workspace_id
      LEFT JOIN hourly_json hj
        ON hj.user_id = sa.user_id AND hj.workspace_id = sa.workspace_id
    )
    INSERT INTO public.daily_activity_stats AS das (
      user_id, workspace_id, day,
      active_seconds, idle_seconds, online_seconds, sessions_count,
      first_seen_at, last_seen_at,
      tasks_completed, tasks_completed_with_project, tasks_completed_inbox,
      productive_seconds, neutral_seconds, distracting_seconds,
      activity_score, hourly_buckets, by_project, top_domains,
      computed_at
    )
    SELECT
      f.user_id, f.workspace_id, f.day,
      f.active_seconds, f.idle_seconds, f.online_seconds, f.sessions_count,
      f.first_seen_at, f.last_seen_at,
      f.tasks_completed, f.tasks_completed_with_project, f.tasks_completed_inbox,
      f.productive_seconds, f.neutral_seconds, f.distracting_seconds,
      f.activity_score, f.hourly_buckets, f.by_project, f.top_domains,
      now()
    FROM final f
    ON CONFLICT (user_id, workspace_id, day) DO UPDATE SET
      active_seconds = EXCLUDED.active_seconds,
      idle_seconds = EXCLUDED.idle_seconds,
      online_seconds = EXCLUDED.online_seconds,
      sessions_count = EXCLUDED.sessions_count,
      first_seen_at = EXCLUDED.first_seen_at,
      last_seen_at = EXCLUDED.last_seen_at,
      tasks_completed = EXCLUDED.tasks_completed,
      tasks_completed_with_project = EXCLUDED.tasks_completed_with_project,
      tasks_completed_inbox = EXCLUDED.tasks_completed_inbox,
      productive_seconds = EXCLUDED.productive_seconds,
      neutral_seconds = EXCLUDED.neutral_seconds,
      distracting_seconds = EXCLUDED.distracting_seconds,
      activity_score = EXCLUDED.activity_score,
      hourly_buckets = EXCLUDED.hourly_buckets,
      by_project = EXCLUDED.by_project,
      top_domains = EXCLUDED.top_domains,
      computed_at = now();

    GET DIAGNOSTICS v_processed = ROW_COUNT;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'days', v_days,
    'processed', v_processed,
    'computed_at', now()
  );
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uk_das_user_ws_day
  ON public.daily_activity_stats (user_id, workspace_id, day);

NOTIFY pgrst, 'reload schema';