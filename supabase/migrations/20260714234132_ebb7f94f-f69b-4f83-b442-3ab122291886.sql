
-- Collapse existing duplicate open reports (keep earliest per reporter/ad)
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY ad_id, reporter_id ORDER BY created_at ASC) AS rn
    FROM public.reports
   WHERE status = 'open' AND reporter_id IS NOT NULL
)
DELETE FROM public.reports r USING ranked
 WHERE r.id = ranked.id AND ranked.rn > 1;

-- One open report per (ad, reporter). Partial unique so closed/resolved history isn't affected.
CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_open_per_reporter
  ON public.reports (ad_id, reporter_id)
  WHERE status = 'open' AND reporter_id IS NOT NULL;

-- Count DISTINCT reporters so one user can't force a takedown.
CREATE OR REPLACE FUNCTION public.moderation_auto_takedown(_threshold integer DEFAULT 5, _min_age_minutes integer DEFAULT 10)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _removed INTEGER := 0;
  _r RECORD;
  _admin RECORD;
BEGIN
  IF _threshold < 1 THEN RAISE EXCEPTION 'threshold must be >= 1'; END IF;

  FOR _r IN
    SELECT a.id, a.short_id, a.title,
           COUNT(DISTINCT rp.reporter_id)::INTEGER AS open_reports
      FROM public.ads a
      JOIN public.reports rp ON rp.ad_id = a.id AND rp.status = 'open' AND rp.reporter_id IS NOT NULL
     WHERE a.status = 'live'
     GROUP BY a.id, a.short_id, a.title
    HAVING COUNT(DISTINCT rp.reporter_id) >= _threshold
       AND MIN(rp.created_at) <= now() - make_interval(mins => _min_age_minutes)
  LOOP
    UPDATE public.ads
       SET status = 'removed',
           rejection_reason = COALESCE(rejection_reason,
             'Auto-removed: ' || _r.open_reports || ' distinct reporters (threshold ' || _threshold || ')')
     WHERE id = _r.id;

    INSERT INTO public.audit_log(actor_id, action, target_table, target_id, detail)
    VALUES (NULL, 'moderation_auto_takedown', 'ads', _r.id,
            jsonb_build_object('short_id', _r.short_id,
                               'title', _r.title,
                               'open_reports', _r.open_reports,
                               'threshold', _threshold,
                               'reason', 'distinct_reporter_threshold'));

    FOR _admin IN
      SELECT DISTINCT user_id FROM public.user_roles
       WHERE role IN ('admin','superadmin')
    LOOP
      INSERT INTO public.admin_notifications(user_id, kind, title, body, target_table, target_id, detail)
      VALUES (
        _admin.user_id,
        'auto_takedown',
        'Ad auto-removed: #' || _r.short_id,
        _r.open_reports || ' distinct reporters met the threshold of ' || _threshold || '. Listing: ' || _r.title,
        'ads', _r.id,
        jsonb_build_object('short_id', _r.short_id, 'open_reports', _r.open_reports, 'threshold', _threshold)
      );
    END LOOP;

    _removed := _removed + 1;
  END LOOP;

  RETURN _removed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.moderation_auto_takedown_dry_run(_threshold integer DEFAULT 5, _min_age_minutes integer DEFAULT 10)
 RETURNS TABLE(ad_id uuid, short_id text, title text, open_reports integer, first_report_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.short_id, a.title,
         COUNT(DISTINCT rp.reporter_id)::integer AS open_reports,
         MIN(rp.created_at) AS first_report_at
    FROM public.ads a
    JOIN public.reports rp ON rp.ad_id = a.id AND rp.status = 'open' AND rp.reporter_id IS NOT NULL
   WHERE a.status = 'live'
     AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superadmin'))
   GROUP BY a.id, a.short_id, a.title
   HAVING COUNT(DISTINCT rp.reporter_id) >= _threshold
      AND MIN(rp.created_at) <= now() - make_interval(mins => _min_age_minutes)
   ORDER BY open_reports DESC;
$function$;
