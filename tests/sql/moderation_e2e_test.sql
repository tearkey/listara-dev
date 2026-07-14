-- End-to-end moderation + ranking integration test.
-- 1. Submits 4 ads through moderation (pending -> live via setAdStatus's SQL shape).
-- 2. Verifies ordering by ad_rank_score matches the expected tier hierarchy.
-- 3. Verifies ad_rank_breakdown returns the same score, 4 components, and
--    stable explain labels for a known dataset.
-- Rolled back at the end; no persistent data.

BEGIN;
SET LOCAL role = 'postgres';

CREATE SCHEMA IF NOT EXISTS _mod_e2e;
CREATE OR REPLACE FUNCTION _mod_e2e.has_role(_user_id uuid, _role public.app_role)
  RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
SET LOCAL search_path = _mod_e2e, public;

DO $$
DECLARE
  _uid uuid;
  _city uuid;
  _cat uuid;
  _ids uuid[] := ARRAY[]::uuid[];
  _tiers ad_tier[] := ARRAY['sticky','featured','bumped','free']::ad_tier[];
  _t ad_tier;
  _id uuid;
  _order uuid[];
  _score numeric;
  _r jsonb;
  _labels text[];
  _prev numeric := NULL;
  _cur  numeric;
BEGIN
  SELECT id INTO _uid FROM auth.users LIMIT 1;
  IF _uid IS NULL THEN _uid := gen_random_uuid(); END IF;
  SELECT id INTO _city FROM public.cities LIMIT 1;
  SELECT id INTO _cat  FROM public.categories LIMIT 1;

  -- Step 1: submit each ad as pending (mimics user submission).
  FOREACH _t IN ARRAY _tiers LOOP
    _id := gen_random_uuid();
    INSERT INTO public.ads (id, user_id, city_id, category_id, title, slug, body,
                            status, tier, view_count)
    VALUES (_id, _uid, _city, _cat, 'e2e-'||_t, 'e2e-'||_t||'-'||_id, 'body',
            'pending', _t, 0);
    _ids := _ids || _id;
  END LOOP;

  -- Step 2: publish each ad via the same update setAdStatus performs.
  UPDATE public.ads
     SET status = 'live',
         posted_at = now(),
         expires_at = now() + interval '24 hours',
         bumped_at = now(),
         rejection_reason = NULL
   WHERE id = ANY(_ids);

  -- All should be live.
  IF (SELECT COUNT(*) FROM public.ads WHERE id = ANY(_ids) AND status = 'live') <> 4 THEN
    RAISE EXCEPTION 'expected 4 live ads after publish';
  END IF;

  -- Step 3: ordering — highest ad_rank_score first must be sticky,featured,bumped,free.
  SELECT array_agg(id ORDER BY public.ad_rank_score(tier, bumped_at, posted_at, view_count, 0) DESC)
    INTO _order
    FROM public.ads WHERE id = ANY(_ids);

  IF _order[1] <> _ids[1] THEN RAISE EXCEPTION 'ordering[1] expected sticky, got %', _order[1]; END IF;
  IF _order[2] <> _ids[2] THEN RAISE EXCEPTION 'ordering[2] expected featured, got %', _order[2]; END IF;
  IF _order[3] <> _ids[3] THEN RAISE EXCEPTION 'ordering[3] expected bumped, got %', _order[3]; END IF;
  IF _order[4] <> _ids[4] THEN RAISE EXCEPTION 'ordering[4] expected free, got %', _order[4]; END IF;

  -- Step 4: for each ad the breakdown score matches ad_rank_score, has 4
  -- stable-labeled components, and scores decrease monotonically down the list.
  FOREACH _id IN ARRAY _order LOOP
    _r := public.ad_rank_breakdown(_id);
    IF jsonb_array_length(_r->'components') <> 4 THEN
      RAISE EXCEPTION 'breakdown missing components for %', _id;
    END IF;
    SELECT array_agg(elem->>'label' ORDER BY ord)
      INTO _labels
      FROM jsonb_array_elements(_r->'components') WITH ORDINALITY AS t(elem, ord);
    IF _labels[1] NOT LIKE 'Tier bonus%'
       OR _labels[2] <> 'Recency'
       OR _labels[3] <> 'View boost'
       OR _labels[4] <> 'Report penalty' THEN
      RAISE EXCEPTION 'label drift: %', _labels;
    END IF;

    SELECT (_r->>'score')::numeric INTO _cur;
    SELECT ROUND(public.ad_rank_score(tier, bumped_at, posted_at, view_count, 0)::numeric, 2)
      INTO _score FROM public.ads WHERE id = _id;
    IF abs(_cur - _score) > 0.01 THEN
      RAISE EXCEPTION 'breakdown score % != ad_rank_score % for ad %', _cur, _score, _id;
    END IF;

    IF _prev IS NOT NULL AND _cur > _prev THEN
      RAISE EXCEPTION 'scores not monotonic: prev=% cur=%', _prev, _cur;
    END IF;
    _prev := _cur;
  END LOOP;

  RAISE NOTICE 'moderation + ranking e2e passed';
END $$;

ROLLBACK;