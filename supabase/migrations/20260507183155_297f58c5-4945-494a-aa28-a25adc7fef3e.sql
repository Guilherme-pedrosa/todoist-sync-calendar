CREATE OR REPLACE FUNCTION public.run_activity_aggregate(p_day date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_days date[];
  v_day date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_processed int := 0;
  v_total_processed int := 0;
BEGIN
  IF p_day IS NULL THEN
    v_days := ARRAY[
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1),
      (now() AT TIME ZONE 'America/Sao_Paulo')::date
    ];
  ELSE
    v_days := ARRAY[p_day];
  END IF;

  FOREACH v_day IN ARRAY v_days
  LOOP
    v_day_start := ((v_day::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo');
    v_day_end := (((v_day + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo') - interval '1 millisecond';

    WITH
    heartbeat_windows AS (
      SELECT
        h.user_id,
        h.workspace_id,
        GREATEST(h.ts - interval '45 seconds', v_day_start) AS lo,
        LEAST(h.ts + interval '45 seconds', v_day_end) AS hi,
        h.ts
      FROM public.activity_heartbeats h
      WHERE h.ts >= v_day_start
        AND h.ts <= v_day_end
        AND h.is_active = true
    ),
    heartbeat_valid AS (
      SELECT * FROM heartbeat_windows WHERE hi > lo
    ),
    active_marked AS (
      SELECT
        user_id, workspace_id, lo, hi,
        CASE
          WHEN lo <= MAX(hi) OVER (
            PARTITION BY user_id, workspace_id ORDER BY lo
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ) THEN 0 ELSE 1
        END AS is_new_group
      FROM heartbeat_valid
    ),
    active_grouped AS (
      SELECT
        user_id, workspace_id, lo, hi,
        SUM(is_new_group) OVER (
          PARTITION BY user_id, workspace_id ORDER BY lo
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS grp
      FROM active_marked
    ),
    active_merged AS (
      SELECT user_id, workspace_id, grp, MIN(lo) AS lo, MAX(hi) AS hi
      FROM active_grouped
      GROUP BY user_id, workspace_id, grp
    ),
    active_agg AS (
      SELECT
        user_id,
        workspace_id,
        LEAST(86400, SUM(EXTRACT(EPOCH FROM (hi - lo)))::int) AS active_seconds,
        MIN(lo) AS first_seen_at,
        MAX(hi) AS last_seen_at
      FROM active_merged
      GROUP BY user_id, workspace_id
    ),
    session_counts AS (
      SELECT
        s.user_id,
        s.workspace_id,
        COUNT(*)::int AS sessions_count
      FROM public.activity_sessions s
      WHERE s.started_at <= v_day_end
        AND COALESCE(s.ended_at, s.last_seen_at) >= v_day_start
      GROUP BY s.user_id, s.workspace_id
    ),
    hourly AS (
      SELECT
        user_id,
        workspace_id,
        EXTRACT(HOUR FROM ts AT TIME ZONE 'UTC')::int AS hour_bucket,
        COUNT(*)::int * 30 AS seconds_in_bucket
      FROM public.activity_heartbeats
      WHERE ts >= v_day_start
        AND ts <= v_day_end
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
        COALESCE(p.is_inbox, false) AS is_inbox,
        COUNT(*)::int AS qtd
      FROM public.activity_log al
      JOIN public.tasks t
        ON t.id = COALESCE(NULLIF(al.payload->>'task_id', '')::uuid, al.entity_id)
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
        COALESCE(SUM(qtd), 0)::int AS tasks_completed,
        COALESCE(SUM(qtd) FILTER (WHERE is_inbox = false), 0)::int AS tasks_completed_with_project,
        COALESCE(SUM(qtd) FILTER (WHERE is_inbox = true), 0)::int AS tasks_completed_inbox,
        COALESCE(
          jsonb_object_agg(
            COALESCE(project_id::text, 'inbox'),
            jsonb_build_object('name', COALESCE(project_name, '—'), 'tasks', qtd, 'seconds', 0)
          ),
          '{}'::jsonb
        ) AS by_project
      FROM completions
      GROUP BY user_id, workspace_id
    ),
    visits_raw AS (
      SELECT
        v.user_id,
        v.workspace_id,
        v.domain,
        COALESCE(dc.category, dcl.category, 'neutral') AS category,
        GREATEST(v.started_at, v_day_start) AS lo,
        LEAST(
          COALESCE(
            v.ended_at,
            v.started_at + (LEAST(GREATEST(COALESCE(v.duration_seconds, 0), 1), 1800) || ' seconds')::interval
          ),
          v_day_end
        ) AS hi
      FROM public.activity_url_visits v
      LEFT JOIN public.domain_categories dc
        ON dc.workspace_id = v.workspace_id AND dc.domain = v.domain
      LEFT JOIN public.domain_classifications dcl
        ON dcl.domain = v.domain
      WHERE v.started_at <= v_day_end
        AND COALESCE(v.ended_at, v.started_at + interval '30 minutes') >= v_day_start
    ),
    visits_valid AS (
      SELECT * FROM visits_raw WHERE hi > lo
    ),
    visits_marked AS (
      SELECT
        user_id, workspace_id, domain, category, lo, hi,
        CASE
          WHEN lo <= MAX(hi) OVER (
            PARTITION BY user_id, workspace_id ORDER BY lo
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ) THEN 0 ELSE 1
        END AS is_new_group
      FROM visits_valid
    ),
    visits_grouped AS (
      SELECT
        user_id, workspace_id, domain, category, lo, hi,
        SUM(is_new_group) OVER (
          PARTITION BY user_id, workspace_id ORDER BY lo
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS grp
      FROM visits_marked
    ),
    visits_merged AS (
      SELECT
        user_id,
        workspace_id,
        grp,
        MIN(lo) AS lo,
        MAX(hi) AS hi,
        CASE
          WHEN bool_or(category = 'distracting') THEN 'distracting'
          WHEN bool_or(category = 'neutral') THEN 'neutral'
          ELSE 'productive'
        END AS category
      FROM visits_grouped
      GROUP BY user_id, workspace_id, grp
    ),
    visits_agg AS (
      SELECT
        user_id,
        workspace_id,
        COALESCE((SUM(EXTRACT(EPOCH FROM (hi - lo))) FILTER (WHERE category = 'productive'))::int, 0) AS productive_seconds,
        COALESCE((SUM(EXTRACT(EPOCH FROM (hi - lo))) FILTER (WHERE category = 'neutral'))::int, 0) AS neutral_seconds,
        COALESCE((SUM(EXTRACT(EPOCH FROM (hi - lo))) FILTER (WHERE category = 'distracting'))::int, 0) AS distracting_seconds
      FROM visits_merged
      GROUP BY user_id, workspace_id
    ),
    visits_per_domain AS (
      SELECT
        user_id,
        workspace_id,
        domain,
        category,
        SUM(EXTRACT(EPOCH FROM (hi - lo)))::int AS seconds
      FROM visits_valid
      GROUP BY user_id, workspace_id, domain, category
    ),
    top_domains_agg AS (
      SELECT
        user_id,
        workspace_id,
        jsonb_agg(
          jsonb_build_object('domain', domain, 'seconds', seconds, 'category', category)
          ORDER BY seconds DESC
        ) AS top_domains
      FROM visits_per_domain
      WHERE seconds > 0
      GROUP BY user_id, workspace_id
    ),
    keyspace AS (
      SELECT user_id, workspace_id FROM active_agg
      UNION
      SELECT user_id, workspace_id FROM session_counts
      UNION
      SELECT user_id, workspace_id FROM completions_agg
      UNION
      SELECT user_id, workspace_id FROM visits_agg
    ),
    final AS (
      SELECT
        k.user_id,
        k.workspace_id,
        v_day AS day,
        COALESCE(aa.active_seconds, 0) AS active_seconds,
        0 AS idle_seconds,
        COALESCE(aa.active_seconds, 0) AS online_seconds,
        COALESCE(sc.sessions_count, 0) AS sessions_count,
        aa.first_seen_at,
        aa.last_seen_at,
        COALESCE(ca.tasks_completed, 0) AS tasks_completed,
        COALESCE(ca.tasks_completed_with_project, 0) AS tasks_completed_with_project,
        COALESCE(ca.tasks_completed_inbox, 0) AS tasks_completed_inbox,
        COALESCE(va.productive_seconds, 0) AS prod_raw,
        COALESCE(va.neutral_seconds, 0) AS neut_raw,
        COALESCE(va.distracting_seconds, 0) AS dist_raw,
        COALESCE(hj.hourly_buckets, '{}'::jsonb) AS hourly_buckets,
        COALESCE(ca.by_project, '{}'::jsonb) AS by_project,
        COALESCE(td.top_domains, '[]'::jsonb) AS top_domains
      FROM keyspace k
      LEFT JOIN active_agg aa ON aa.user_id = k.user_id AND aa.workspace_id = k.workspace_id
      LEFT JOIN session_counts sc ON sc.user_id = k.user_id AND sc.workspace_id = k.workspace_id
      LEFT JOIN completions_agg ca ON ca.user_id = k.user_id AND ca.workspace_id = k.workspace_id
      LEFT JOIN visits_agg va ON va.user_id = k.user_id AND va.workspace_id = k.workspace_id
      LEFT JOIN top_domains_agg td ON td.user_id = k.user_id AND td.workspace_id = k.workspace_id
      LEFT JOIN hourly_json hj ON hj.user_id = k.user_id AND hj.workspace_id = k.workspace_id
    ),
    final_capped AS (
      SELECT
        f.*,
        CASE WHEN (f.prod_raw + f.neut_raw + f.dist_raw) > f.online_seconds AND f.online_seconds > 0
          THEN (f.prod_raw::numeric * f.online_seconds / (f.prod_raw + f.neut_raw + f.dist_raw))::int
          ELSE f.prod_raw END AS productive_capped,
        CASE WHEN (f.prod_raw + f.neut_raw + f.dist_raw) > f.online_seconds AND f.online_seconds > 0
          THEN (f.neut_raw::numeric * f.online_seconds / (f.prod_raw + f.neut_raw + f.dist_raw))::int
          ELSE f.neut_raw END AS neutral_capped,
        CASE WHEN (f.prod_raw + f.neut_raw + f.dist_raw) > f.online_seconds AND f.online_seconds > 0
          THEN (f.dist_raw::numeric * f.online_seconds / (f.prod_raw + f.neut_raw + f.dist_raw))::int
          ELSE f.dist_raw END AS distracting_capped
      FROM final f
    )
    INSERT INTO public.daily_activity_stats AS das (
      user_id, workspace_id, day,
      active_seconds, idle_seconds, online_seconds, sessions_count,
      first_seen_at, last_seen_at,
      tasks_completed, tasks_completed_with_project, tasks_completed_inbox,
      productive_seconds, neutral_seconds, distracting_seconds,
      activity_score, hourly_buckets, by_project, top_domains, computed_at
    )
    SELECT
      f.user_id, f.workspace_id, f.day,
      f.active_seconds, f.idle_seconds, f.online_seconds, f.sessions_count,
      f.first_seen_at, f.last_seen_at,
      f.tasks_completed, f.tasks_completed_with_project, f.tasks_completed_inbox,
      f.productive_capped, f.neutral_capped, f.distracting_capped,
      LEAST(100, GREATEST(0,
        COALESCE(50.0 * f.active_seconds / NULLIF(f.online_seconds, 0), 0) +
        (30.0 * LEAST(f.tasks_completed, 10) / 10.0) +
        COALESCE(20.0 * f.productive_capped / NULLIF(f.productive_capped + f.distracting_capped, 0), 0)
      ))::int,
      f.hourly_buckets, f.by_project, f.top_domains,
      now()
    FROM final_capped f
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
    v_total_processed := v_total_processed + v_processed;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'days', v_days, 'processed', v_total_processed, 'computed_at', now(), 'timezone', 'America/Sao_Paulo', 'source', 'active_heartbeats_only');
END;
$function$;