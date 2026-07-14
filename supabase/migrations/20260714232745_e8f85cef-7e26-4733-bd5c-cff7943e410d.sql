
-- Dry-run variant of moderation_auto_takedown: returns the ads that WOULD be
-- removed without mutating anything. Same predicate as the real function.
CREATE OR REPLACE FUNCTION public.moderation_auto_takedown_dry_run(
  _threshold integer DEFAULT 5,
  _min_age_minutes integer DEFAULT 10
) RETURNS TABLE (
  ad_id uuid,
  short_id text,
  title text,
  open_reports integer,
  first_report_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.short_id, a.title,
         COUNT(rp.id)::integer AS open_reports,
         MIN(rp.created_at) AS first_report_at
    FROM public.ads a
    JOIN public.reports rp ON rp.ad_id = a.id AND rp.status = 'open'
   WHERE a.status = 'live'
     AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superadmin'))
   GROUP BY a.id, a.short_id, a.title
   HAVING COUNT(rp.id) >= _threshold
      AND MIN(rp.created_at) <= now() - make_interval(mins => _min_age_minutes)
   ORDER BY open_reports DESC;
$$;

-- Cron health check: scans cron.job_run_details for the most recent run of
-- each job, and fans out an admin_notifications row when a job either
-- (a) failed on its last run, or (b) hasn't run within its expected interval.
-- Deduplicates: only alerts once per (job, last-run) pair by inserting a row
-- keyed on kind='cron_health' + detail->>'signature'.
CREATE OR REPLACE FUNCTION public.check_cron_health()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alerts integer := 0;
  _j RECORD;
  _last RECORD;
  _sig text;
  _admin RECORD;
  _msg text;
  _stale boolean;
BEGIN
  FOR _j IN SELECT jobid, jobname, schedule FROM cron.job LOOP
    SELECT * INTO _last
      FROM cron.job_run_details
     WHERE jobid = _j.jobid
     ORDER BY start_time DESC
     LIMIT 1;

    _stale := (_last.start_time IS NULL) OR (_last.start_time < now() - interval '1 hour');
    IF _last.status IS DISTINCT FROM 'succeeded' OR _stale THEN
      _sig := _j.jobname || ':' || COALESCE(_last.runid::text, 'never') || ':' || COALESCE(_last.status, 'missing');

      -- dedupe: skip if already alerted for this signature in the last 24h
      IF EXISTS (
        SELECT 1 FROM public.admin_notifications
         WHERE kind = 'cron_health'
           AND detail->>'signature' = _sig
           AND created_at > now() - interval '24 hours'
      ) THEN CONTINUE; END IF;

      IF _last.start_time IS NULL THEN
        _msg := 'No runs recorded for cron job "' || _j.jobname || '".';
      ELSIF _stale THEN
        _msg := 'Cron job "' || _j.jobname || '" has not run since ' || _last.start_time::text || '.';
      ELSE
        _msg := 'Cron job "' || _j.jobname || '" last run status: ' || _last.status ||
                COALESCE(' — ' || left(_last.return_message, 200), '');
      END IF;

      FOR _admin IN SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('admin','superadmin') LOOP
        INSERT INTO public.admin_notifications(user_id, kind, title, body, target_table, target_id, detail)
        VALUES (
          _admin.user_id, 'cron_health',
          'Cron job alert: ' || _j.jobname,
          _msg, NULL, NULL,
          jsonb_build_object(
            'signature', _sig,
            'jobname', _j.jobname,
            'schedule', _j.schedule,
            'status', COALESCE(_last.status,'missing'),
            'last_start', _last.start_time,
            'return_message', _last.return_message
          )
        );
      END LOOP;
      _alerts := _alerts + 1;
    END IF;
  END LOOP;
  RETURN _alerts;
END;
$$;

-- Read-only helper for the admin UI: returns the current state of every
-- registered cron job together with its most recent run.
CREATE OR REPLACE FUNCTION public.admin_cron_status()
RETURNS TABLE (
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  last_start timestamptz,
  last_end timestamptz,
  last_status text,
  last_return_message text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') AND NOT public.has_role(auth.uid(),'superadmin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;
  RETURN QUERY
    SELECT j.jobid, j.jobname, j.schedule, j.active,
           d.start_time, d.end_time, d.status, d.return_message
      FROM cron.job j
      LEFT JOIN LATERAL (
        SELECT * FROM cron.job_run_details r
         WHERE r.jobid = j.jobid ORDER BY r.start_time DESC LIMIT 1
      ) d ON true
     ORDER BY j.jobname;
END;
$$;

GRANT EXECUTE ON FUNCTION public.moderation_auto_takedown_dry_run(integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cron_status() TO authenticated;
