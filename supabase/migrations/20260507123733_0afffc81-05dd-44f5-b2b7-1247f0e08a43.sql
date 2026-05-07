CREATE OR REPLACE FUNCTION public.advance_stuck_recurrences()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_today date := current_date;
  v_freq text;
  v_interval int;
  v_byday text;
  v_exdate_part text;
  v_exdates date[];
  v_candidate date;
  v_new_due date;
  v_dow int;
  v_allowed_dows int[];
  v_i int;
  v_advanced int := 0;
  v_skipped int := 0;
  v_details jsonb := '[]'::jsonb;
  v_reason text;
  v_byday_map jsonb := jsonb_build_object(
    'SU', 0, 'MO', 1, 'TU', 2, 'WE', 3, 'TH', 4, 'FR', 5, 'SA', 6
  );
  v_token text;
BEGIN
  FOR r IN
    SELECT id, task_number, due_date, recurrence_rule
    FROM public.tasks
    WHERE recurrence_rule IS NOT NULL
      AND completed = false
      AND deleted_at IS NULL
      AND due_date IS NOT NULL
      AND due_date < v_today
  LOOP
    v_reason := NULL;
    v_new_due := NULL;

    -- Extract FREQ
    v_freq := substring(r.recurrence_rule from 'FREQ=([A-Z]+)');
    -- Extract INTERVAL (default 1)
    v_interval := COALESCE(NULLIF(substring(r.recurrence_rule from 'INTERVAL=([0-9]+)'), '')::int, 1);
    -- Extract BYDAY
    v_byday := substring(r.recurrence_rule from 'BYDAY=([A-Z,]+)');

    -- Extract EXDATE (iCal format: EXDATE:20260506T100000 or EXDATE=...)
    v_exdate_part := substring(r.recurrence_rule from 'EXDATE[:=]([0-9TZ,]+)');
    v_exdates := ARRAY[]::date[];
    IF v_exdate_part IS NOT NULL THEN
      SELECT array_agg(to_date(left(trim(d), 8), 'YYYYMMDD'))
      INTO v_exdates
      FROM unnest(string_to_array(v_exdate_part, ',')) d
      WHERE length(trim(d)) >= 8;
    END IF;

    IF v_freq = 'DAILY' THEN
      v_candidate := v_today;
      FOR v_i IN 0..366 LOOP
        IF NOT (v_candidate = ANY(COALESCE(v_exdates, ARRAY[]::date[]))) THEN
          v_new_due := v_candidate;
          EXIT;
        END IF;
        v_candidate := v_candidate + v_interval;
      END LOOP;

    ELSIF v_freq = 'WEEKLY' THEN
      -- Build allowed DOWs
      v_allowed_dows := ARRAY[]::int[];
      IF v_byday IS NOT NULL THEN
        FOREACH v_token IN ARRAY string_to_array(v_byday, ',')
        LOOP
          v_allowed_dows := v_allowed_dows || (v_byday_map->>trim(v_token))::int;
        END LOOP;
      ELSE
        -- Default: same DOW as original due_date
        v_allowed_dows := ARRAY[EXTRACT(DOW FROM r.due_date)::int];
      END IF;

      v_candidate := v_today;
      FOR v_i IN 0..62 LOOP
        v_dow := EXTRACT(DOW FROM v_candidate)::int;
        IF v_dow = ANY(v_allowed_dows)
           AND NOT (v_candidate = ANY(COALESCE(v_exdates, ARRAY[]::date[]))) THEN
          v_new_due := v_candidate;
          EXIT;
        END IF;
        v_candidate := v_candidate + 1;
      END LOOP;

    ELSIF v_freq = 'MONTHLY' THEN
      -- Same day-of-month as original
      v_candidate := make_date(
        EXTRACT(YEAR FROM v_today)::int,
        EXTRACT(MONTH FROM v_today)::int,
        LEAST(EXTRACT(DAY FROM r.due_date)::int, 28)
      );
      IF v_candidate < v_today THEN
        v_candidate := v_candidate + interval '1 month';
      END IF;
      v_new_due := v_candidate;

    ELSE
      v_reason := 'unsupported_freq:' || COALESCE(v_freq, 'NULL');
    END IF;

    IF v_new_due IS NOT NULL THEN
      UPDATE public.tasks
      SET due_date = v_new_due,
          updated_at = now()
      WHERE id = r.id;

      v_advanced := v_advanced + 1;
      v_details := v_details || jsonb_build_object(
        'task_number', r.task_number,
        'old_due', r.due_date,
        'new_due', v_new_due,
        'reason', 'advanced'
      );
    ELSE
      v_skipped := v_skipped + 1;
      v_details := v_details || jsonb_build_object(
        'task_number', r.task_number,
        'old_due', r.due_date,
        'new_due', NULL,
        'reason', COALESCE(v_reason, 'no_candidate_found')
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'advanced', v_advanced,
    'skipped', v_skipped,
    'details', v_details
  );
END $function$;