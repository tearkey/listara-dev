-- Canary end-to-end test for the moderation_auto_takedown flow.
-- Verifies that when an ad crosses the report threshold:
--   1. The ad is set to status='removed' with a rejection_reason
--   2. An audit_log row with action='moderation_auto_takedown' is written
--   3. Every admin/superadmin receives an admin_notifications row
-- Rolled back at the end — no persistent data.

BEGIN;

DO $$
DECLARE
  _uid uuid;
  _admin uuid;
  _city uuid;
  _cat uuid;
  _ad uuid := gen_random_uuid();
  _admins int;
  _removed int;
  _status text;
  _reason text;
  _audits int;
  _notifs int;
  _detail jsonb;
BEGIN
  SELECT id INTO _uid   FROM public.profiles LIMIT 1;
  IF _uid IS NULL THEN _uid := gen_random_uuid(); END IF;
  SELECT id INTO _city  FROM public.cities     LIMIT 1;
  SELECT id INTO _cat   FROM public.categories LIMIT 1;

  SELECT user_id INTO _admin FROM public.user_roles
   WHERE role IN ('admin','superadmin') LIMIT 1;
  IF _admin IS NULL THEN
    _admin := _uid;
    INSERT INTO public.user_roles(user_id, role) VALUES (_admin, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  SELECT COUNT(DISTINCT user_id) INTO _admins FROM public.user_roles
   WHERE role IN ('admin','superadmin');

  INSERT INTO public.ads(id, user_id, city_id, category_id, title, slug, body,
                         status, tier, posted_at)
  VALUES (_ad, _uid, _city, _cat, 'canary-takedown',
          'canary-takedown-'||_ad, 'body', 'live', 'free', now() - interval '1 hour');

  INSERT INTO public.reports(ad_id, reporter_id, reason, status, created_at)
  SELECT _ad, _uid, 'spam', 'open', now() - interval '30 minutes'
  FROM generate_series(1, 6);

  SELECT public.moderation_auto_takedown(5, 10) INTO _removed;
  IF _removed < 1 THEN
    RAISE EXCEPTION 'canary FAIL: moderation_auto_takedown removed 0 ads';
  END IF;

  SELECT status, rejection_reason INTO _status, _reason
    FROM public.ads WHERE id = _ad;
  IF _status <> 'removed' THEN
    RAISE EXCEPTION 'canary FAIL: ad status = % (expected removed)', _status;
  END IF;
  IF _reason IS NULL OR _reason NOT LIKE 'Auto-removed:%' THEN
    RAISE EXCEPTION 'canary FAIL: rejection_reason = %', _reason;
  END IF;

  SELECT COUNT(*) INTO _audits FROM public.audit_log
   WHERE action = 'moderation_auto_takedown' AND target_id = _ad;
  SELECT detail INTO _detail FROM public.audit_log
   WHERE action = 'moderation_auto_takedown' AND target_id = _ad
   ORDER BY created_at DESC LIMIT 1;
  IF _audits < 1 THEN
    RAISE EXCEPTION 'canary FAIL: no audit_log row written';
  END IF;
  IF (_detail->>'open_reports')::int < 6
     OR (_detail->>'threshold')::int <> 5
     OR (_detail->>'reason') <> 'report_threshold' THEN
    RAISE EXCEPTION 'canary FAIL: audit_log.detail unexpected: %', _detail;
  END IF;

  SELECT COUNT(*) INTO _notifs
    FROM public.admin_notifications
   WHERE kind = 'auto_takedown' AND target_id = _ad;
  IF _notifs < _admins THEN
    RAISE EXCEPTION 'canary FAIL: notifications=% for admins=%', _notifs, _admins;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.moderation_auto_takedown_dry_run(5, 10) WHERE ad_id = _ad
  ) THEN
    RAISE EXCEPTION 'canary FAIL: dry-run still lists a removed ad';
  END IF;

  RAISE NOTICE 'canary PASS: removed=%, audits=%, notifications=%', _removed, _audits, _notifs;
END $$;

ROLLBACK;