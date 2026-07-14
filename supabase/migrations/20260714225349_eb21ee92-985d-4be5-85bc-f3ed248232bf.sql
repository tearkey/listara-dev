
-- Admin notifications (in-app messages for admin actions/events)
CREATE TABLE public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  target_table TEXT,
  target_id UUID,
  detail JSONB NOT NULL DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_notifs_user_unread ON public.admin_notifications(user_id, read_at, created_at DESC);

GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read their own notifications"
  ON public.admin_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superadmin')));

CREATE POLICY "Admins mark their own notifications read"
  ON public.admin_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Rewrite moderation_auto_takedown to use correct audit_log columns
-- (target_table/detail) and fan-out an admin_notifications row per admin.
CREATE OR REPLACE FUNCTION public.moderation_auto_takedown(
  _threshold INTEGER DEFAULT 5,
  _min_age_minutes INTEGER DEFAULT 10
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _removed INTEGER := 0;
  _r RECORD;
  _admin RECORD;
BEGIN
  IF _threshold < 1 THEN RAISE EXCEPTION 'threshold must be >= 1'; END IF;

  FOR _r IN
    SELECT a.id, a.short_id, a.title, COUNT(rp.id)::INTEGER AS open_reports
      FROM public.ads a
      JOIN public.reports rp ON rp.ad_id = a.id AND rp.status = 'open'
     WHERE a.status = 'live'
     GROUP BY a.id, a.short_id, a.title
    HAVING COUNT(rp.id) >= _threshold
       AND MIN(rp.created_at) <= now() - make_interval(mins => _min_age_minutes)
  LOOP
    UPDATE public.ads
       SET status = 'removed',
           rejection_reason = COALESCE(rejection_reason,
             'Auto-removed: ' || _r.open_reports || ' open reports (threshold ' || _threshold || ')')
     WHERE id = _r.id;

    INSERT INTO public.audit_log(actor_id, action, target_table, target_id, detail)
    VALUES (NULL, 'moderation_auto_takedown', 'ads', _r.id,
            jsonb_build_object('short_id', _r.short_id,
                               'title', _r.title,
                               'open_reports', _r.open_reports,
                               'threshold', _threshold,
                               'reason', 'report_threshold'));

    -- Fan out in-app notification to every admin/superadmin.
    FOR _admin IN
      SELECT DISTINCT user_id FROM public.user_roles
       WHERE role IN ('admin','superadmin')
    LOOP
      INSERT INTO public.admin_notifications(user_id, kind, title, body, target_table, target_id, detail)
      VALUES (
        _admin.user_id,
        'auto_takedown',
        'Ad auto-removed: #' || _r.short_id,
        _r.open_reports || ' open reports met the threshold of ' || _threshold || '. Listing: ' || _r.title,
        'ads', _r.id,
        jsonb_build_object('short_id', _r.short_id, 'open_reports', _r.open_reports, 'threshold', _threshold)
      );
    END LOOP;

    _removed := _removed + 1;
  END LOOP;

  RETURN _removed;
END;
$$;

REVOKE ALL ON FUNCTION public.moderation_auto_takedown(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_auto_takedown(INTEGER, INTEGER) TO service_role;
