
-- Auto-takedown for ads with too many open reports.
CREATE OR REPLACE FUNCTION public.moderation_auto_takedown(_threshold INTEGER DEFAULT 5, _min_age_minutes INTEGER DEFAULT 10)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _removed INTEGER := 0;
  _r RECORD;
BEGIN
  IF _threshold < 1 THEN RAISE EXCEPTION 'threshold must be >= 1'; END IF;

  FOR _r IN
    SELECT a.id, a.short_id, COUNT(r.id)::INTEGER AS open_reports
      FROM public.ads a
      JOIN public.reports r ON r.ad_id = a.id AND r.status = 'open'
     WHERE a.status = 'live'
     GROUP BY a.id, a.short_id
    HAVING COUNT(r.id) >= _threshold
       AND MIN(r.created_at) <= now() - make_interval(mins => _min_age_minutes)
  LOOP
    UPDATE public.ads
       SET status = 'removed',
           rejection_reason = COALESCE(rejection_reason,
             'Auto-removed: ' || _r.open_reports || ' open reports (threshold ' || _threshold || ')')
     WHERE id = _r.id;

    INSERT INTO public.audit_log(actor_id, action, target_type, target_id, metadata)
    VALUES (NULL, 'moderation_auto_takedown', 'ad', _r.id,
            jsonb_build_object('short_id', _r.short_id,
                               'open_reports', _r.open_reports,
                               'threshold', _threshold));
    _removed := _removed + 1;
  END LOOP;

  RETURN _removed;
END;
$$;

REVOKE ALL ON FUNCTION public.moderation_auto_takedown(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderation_auto_takedown(INTEGER, INTEGER) TO service_role;

-- Schedule alongside existing expire_stale_ads job.
DO $$ BEGIN
  PERFORM cron.unschedule('moderation-auto-takedown');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'moderation-auto-takedown',
  '*/15 * * * *',
  $$ SELECT public.moderation_auto_takedown(5, 10); $$
);
