-- =========================================================================
-- SECURITY HARDENING — column-level write guards + atomic refund
--
-- The publishable/anon key is public, and several RLS policies are row-scoped
-- but column-unrestricted. That let a signed-in user bypass the server
-- functions entirely and write privileged columns straight through the
-- PostgREST Data API:
--   * ads UPDATE  — self-approve past moderation (status -> 'live'), grant
--                   paid tiers for free (tier -> 'sticky'/'featured'), extend
--                   expires_at past the 24h lifetime, zero report_count,
--                   inflate view_count, or bump without the 72h cooldown.
--   * ads INSERT  — create a live, sticky, non-expiring ad directly, skipping
--                   credit charging and moderation.
--   * profiles    — a banned user could set is_banned=false on their own row,
--                   or inflate their own reputation score.
--   * reports     — INSERT was open to anon (reporter_id IS NULL), so report
--                   spam could sidestep the per-user rate limit.
--   * messages    — the recipient "mark read" UPDATE policy allowed rewriting
--                   any column, including the message body.
--
-- Fix: BEFORE triggers that constrain what anon/authenticated Data API
-- requests may write. service_role (the app server + cron jobs) and
-- admin/moderator sessions are unaffected, so every legitimate flow keeps
-- working — all server-created ad rows now go through the service-role client.
-- Also adds refund_credits() so the app can refund atomically.
-- =========================================================================

-- Role claim of the current Data API request. Returns '' for non-PostgREST
-- sessions (cron, psql, migrations, service_role), which are treated as trusted.
CREATE OR REPLACE FUNCTION public.request_jwt_role()
RETURNS text
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '')
$$;
REVOKE ALL ON FUNCTION public.request_jwt_role() FROM PUBLIC, anon, authenticated;

-- -------------------------------------------------------------------------
-- ADS: guard privileged columns on UPDATE
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_ads_update_guards()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text := public.request_jwt_role();
BEGIN
  -- service_role, cron and direct DB sessions are trusted.
  IF _role NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  -- Admins and moderators keep full control through their own session.
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator') THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'ads.user_id cannot be changed';
  END IF;

  -- Owners may take their own ad down; every other status transition is
  -- reserved for moderation / platform jobs.
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'removed' THEN
    RAISE EXCEPTION 'Ad status is managed by moderation';
  END IF;

  IF NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.tier_expires_at IS DISTINCT FROM OLD.tier_expires_at THEN
    RAISE EXCEPTION 'Promotion tiers require a completed payment';
  END IF;

  IF NEW.posted_at    IS DISTINCT FROM OLD.posted_at
     OR NEW.expires_at   IS DISTINCT FROM OLD.expires_at
     OR NEW.view_count   IS DISTINCT FROM OLD.view_count
     OR NEW.report_count IS DISTINCT FROM OLD.report_count
     OR NEW.short_id     IS DISTINCT FROM OLD.short_id
     OR NEW.created_at   IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'This field is managed by the platform';
  END IF;

  -- Free bump: enforce the 72h cooldown at the database layer too.
  IF NEW.bumped_at IS DISTINCT FROM OLD.bumped_at THEN
    IF NEW.bumped_at IS NULL THEN
      RAISE EXCEPTION 'bumped_at cannot be cleared';
    END IF;
    IF OLD.bumped_at IS NOT NULL AND OLD.bumped_at > now() - interval '72 hours' THEN
      RAISE EXCEPTION 'You can bump a free ad once every 72 hours';
    END IF;
    IF NEW.bumped_at > now() + interval '1 minute' THEN
      RAISE EXCEPTION 'bumped_at cannot be set in the future';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ads_update_guards ON public.ads;
CREATE TRIGGER trg_ads_update_guards
  BEFORE UPDATE ON public.ads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ads_update_guards();

-- -------------------------------------------------------------------------
-- ADS: guard privileged columns on INSERT. Direct Data API inserts may only
-- create unpromoted pending/draft rows; live and promoted ads are created by
-- the app server via service_role after moderation + payment checks.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_ads_insert_guards()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text := public.request_jwt_role();
BEGIN
  IF _role NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator') THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('pending', 'draft') THEN
    RAISE EXCEPTION 'New ads start in pending review';
  END IF;
  IF NEW.tier <> 'free' OR NEW.tier_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'Promotion tiers require a completed payment';
  END IF;

  NEW.view_count   := 0;
  NEW.report_count := 0;
  NEW.posted_at    := NULL;
  NEW.expires_at   := NULL;
  NEW.bumped_at    := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ads_insert_guards ON public.ads;
CREATE TRIGGER trg_ads_insert_guards
  BEFORE INSERT ON public.ads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ads_insert_guards();

-- -------------------------------------------------------------------------
-- PROFILES: users may edit their profile, but not moderation-owned fields.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profiles_update_guards()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text := public.request_jwt_role();
BEGIN
  IF _role NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    RAISE EXCEPTION 'profiles.is_banned is managed by moderators';
  END IF;
  IF NEW.reputation IS DISTINCT FROM OLD.reputation THEN
    RAISE EXCEPTION 'profiles.reputation is managed by the platform';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_update_guards ON public.profiles;
CREATE TRIGGER trg_profiles_update_guards
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profiles_update_guards();

-- -------------------------------------------------------------------------
-- MESSAGES: the recipient may only flip read_at; nothing else (esp. body).
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_messages_update_guards()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text := public.request_jwt_role();
BEGIN
  IF _role NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NEW.body       IS DISTINCT FROM OLD.body
     OR NEW.sender_id    IS DISTINCT FROM OLD.sender_id
     OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
     OR NEW.ad_id        IS DISTINCT FROM OLD.ad_id
     OR NEW.created_at   IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only read status can be updated on a message';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_update_guards ON public.messages;
CREATE TRIGGER trg_messages_update_guards
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_messages_update_guards();

-- -------------------------------------------------------------------------
-- REPORTS: require a signed-in reporter (anon spam bypassed the rate limit).
-- The reportAd server fn always sets reporter_id = the caller's uid.
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create reports" ON public.reports;
CREATE POLICY "Signed-in users create their own reports" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- -------------------------------------------------------------------------
-- CREDITS: atomic refund. Replaces the app-side read-modify-write refund in
-- createAd (which raced concurrent spends/refunds). Mirrors spend_credits.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_credits(
  _user_id uuid,
  _amount_cents integer,
  _reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _new_balance integer;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;
  IF _amount_cents <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  INSERT INTO public.user_credits(user_id, balance_cents)
    VALUES (_user_id, _amount_cents)
  ON CONFLICT (user_id) DO UPDATE
    SET balance_cents = public.user_credits.balance_cents + EXCLUDED.balance_cents,
        updated_at = now()
  RETURNING balance_cents INTO _new_balance;

  INSERT INTO public.credit_transactions(user_id, delta_cents, reason)
    VALUES (_user_id, _amount_cents, _reason);

  RETURN _new_balance;
END; $$;

REVOKE ALL ON FUNCTION public.refund_credits(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, integer, text) TO service_role;
