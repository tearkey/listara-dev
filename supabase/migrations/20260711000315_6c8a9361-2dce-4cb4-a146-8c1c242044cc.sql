
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove any prior schedule with the same name (safe if absent)
DO $$
BEGIN
  PERFORM cron.unschedule('expire-stale-ads-every-5min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'expire-stale-ads-every-5min',
  '*/5 * * * *',
  $$ SELECT public.expire_stale_ads(); $$
);
