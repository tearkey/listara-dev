-- 1. Add optional rejection_reason so moderators can tell users why an ad was rejected.
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 2. Enable pg_cron for periodic expiry sweeps.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 3. Sweep function: mark live ads with an expired timestamp as 'expired'.
CREATE OR REPLACE FUNCTION public.expire_stale_ads()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n INTEGER;
BEGIN
  UPDATE public.ads
    SET status = 'expired'
    WHERE status = 'live'
      AND expires_at IS NOT NULL
      AND expires_at < now();
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

-- 4. Schedule it to run every 5 minutes (unschedule if it already exists).
DO $$
BEGIN
  PERFORM cron.unschedule('expire-stale-ads');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('expire-stale-ads', '*/5 * * * *', $$SELECT public.expire_stale_ads();$$);