-- FIX-A: housekeeping de órfãs antigas (idempotente)
UPDATE public.activity_url_visits
SET 
  ended_at = started_at + interval '30 minutes',
  duration_seconds = 1800
WHERE ended_at IS NULL
  AND started_at < now() - interval '6 hours';

-- Cron diário 3h da manhã para fechar órfãs continuamente
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-orphan-visits') THEN
    PERFORM cron.unschedule('cleanup-orphan-visits');
  END IF;
  PERFORM cron.schedule(
    'cleanup-orphan-visits',
    '0 3 * * *',
    $cron$
      UPDATE public.activity_url_visits
      SET ended_at = started_at + interval '30 minutes',
          duration_seconds = 1800
      WHERE ended_at IS NULL
        AND started_at < now() - interval '6 hours';
    $cron$
  );
END $outer$;