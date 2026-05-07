
-- Remove any prior job with same name (idempotent)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'activity-aggregate-15min';

SELECT cron.schedule(
  'activity-aggregate-15min',
  '*/15 * * * *',
  $$ SELECT public.run_activity_aggregate(); $$
);
