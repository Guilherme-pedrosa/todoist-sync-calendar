SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('activity-aggregate-15min', 'activity-aggregate-5min');

SELECT cron.schedule(
  'activity-aggregate-5min',
  '*/5 * * * *',
  $$ SELECT public.run_activity_aggregate(); $$
);