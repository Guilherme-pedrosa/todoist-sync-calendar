DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'productivity-insights-daily';
  IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;

  PERFORM cron.schedule(
    'productivity-insights-daily',
    '0 6 * * *',
    $cmd$
    SELECT net.http_post(
      url := 'https://scgcbifmcvazmalqqpju.supabase.co/functions/v1/productivity-insights-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'PRODUCTIVITY_CRON_SECRET' LIMIT 1)
      ),
      body := jsonb_build_object('period_days', 7)
    );
    $cmd$
  );
END $$;