-- Edge-case unit tests for public.ad_rank_breakdown(uuid).
-- Ensures the function returns stable explanations and never raises a
-- SQL error on unusual inputs (missing tier / null timestamps / extreme
-- view and report counts). Rolled back at the end.

BEGIN;
SET LOCAL role = 'postgres';

CREATE SCHEMA IF NOT EXISTS _rank_edge;
CREATE OR REPLACE FUNCTION _rank_edge.has_role(_user_id uuid, _role public.app_role)
  RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
SET LOCAL search_path = _rank_edge, public;

DO $$
DECLARE
  _uid uuid;
  _city uuid;
  _cat uuid;
  _ad uuid;
  _r jsonb;
  _components jsonb;
  _score numeric;
  _tier_bonus numeric;
  _recency numeric;
  _views_component numeric;
  _report_penalty numeric;
  _labels text[];
  _missing_ad uuid := gen_random_uuid();
  _got_exception boolean;
BEGIN
  SELECT id INTO _uid FROM auth.users LIMIT 1;
  IF _uid IS NULL THEN _uid := gen_random_uuid(); END IF;
  SELECT id INTO _city FROM public.cities LIMIT 1;
  SELECT id INTO _cat  FROM public.categories LIMIT 1;

  ------------------------------------------------------------------
  -- Case 1: missing/default tier ('free') + null timestamps.
  ------------------------------------------------------------------
  _ad := gen_random_uuid();
  INSERT INTO public.ads (id, user_id, city_id, category_id, title, slug, body,
                          status, tier, posted_at, bumped_at, view_count)
  VALUES (_ad, _uid, _city, _cat, 'edge-free', 'edge-free-'||_ad, 'b',
          'live', 'free', NULL, NULL, 0);

  _r := public.ad_rank_breakdown(_ad);
  _components := _r->'components';
  IF jsonb_array_length(_components) <> 4 THEN
    RAISE EXCEPTION 'free/null-timestamps: expected 4 components, got %', jsonb_array_length(_components);
  END IF;

  SELECT array_agg(elem->>'label' ORDER BY ord)
    INTO _labels
    FROM jsonb_array_elements(_components) WITH ORDINALITY AS t(elem, ord);
  IF _labels[1] <> 'Tier bonus (free)' THEN
    RAISE EXCEPTION 'expected tier label "Tier bonus (free)", got %', _labels[1];
  END IF;

  _tier_bonus     := (_components->0->>'value')::numeric;
  _recency        := (_components->1->>'value')::numeric;
  _views_component:= (_components->2->>'value')::numeric;
  _report_penalty := (_components->3->>'value')::numeric;
  _score          := (_r->>'score')::numeric;

  IF _tier_bonus <> 0 THEN RAISE EXCEPTION 'free tier bonus should be 0, got %', _tier_bonus; END IF;
  -- With bumped_at and posted_at both NULL the function falls back to now(),
  -- so the age is ~0 and recency ~100.
  IF _recency < 99.9 OR _recency > 100 THEN
    RAISE EXCEPTION 'null-timestamp recency expected ~100, got %', _recency;
  END IF;
  IF _views_component <> 0 THEN RAISE EXCEPTION 'expected 0 view boost, got %', _views_component; END IF;
  IF _report_penalty <> 0 THEN RAISE EXCEPTION 'expected 0 penalty, got %', _report_penalty; END IF;
  IF abs(_score - (_tier_bonus + _recency + _views_component + _report_penalty)) > 0.01 THEN
    RAISE EXCEPTION 'score % != sum of components', _score;
  END IF;

  ------------------------------------------------------------------
  -- Case 2: very old posted_at → recency floors at 0, never negative.
  ------------------------------------------------------------------
  UPDATE public.ads SET posted_at = now() - interval '365 days',
                        bumped_at = NULL WHERE id = _ad;
  _r := public.ad_rank_breakdown(_ad);
  _recency := (_r->'components'->1->>'value')::numeric;
  IF _recency <> 0 THEN
    RAISE EXCEPTION '365d-old recency should clamp to 0, got %', _recency;
  END IF;

  ------------------------------------------------------------------
  -- Case 3: extreme view_count — must not overflow and stays finite.
  ------------------------------------------------------------------
  UPDATE public.ads SET view_count = 2147483647, posted_at = now(), bumped_at = now()
   WHERE id = _ad;
  _r := public.ad_rank_breakdown(_ad);
  _views_component := (_r->'components'->2->>'value')::numeric;
  -- 5 * ln(2^31) ≈ 108.5
  IF _views_component < 100 OR _views_component > 120 THEN
    RAISE EXCEPTION 'extreme view boost outside plausible range, got %', _views_component;
  END IF;

  ------------------------------------------------------------------
  -- Case 4: extreme report count.
  ------------------------------------------------------------------
  INSERT INTO public.reports (ad_id, reason, status)
  SELECT _ad, 'spam', 'open' FROM generate_series(1, 500);
  _r := public.ad_rank_breakdown(_ad);
  _report_penalty := (_r->'components'->3->>'value')::numeric;
  IF (_r->>'reports')::int <> 500 THEN
    RAISE EXCEPTION 'expected 500 reports, got %', _r->>'reports';
  END IF;
  IF _report_penalty <> -12500 THEN
    RAISE EXCEPTION 'expected report penalty -12500, got %', _report_penalty;
  END IF;

  ------------------------------------------------------------------
  -- Case 5: missing ad → controlled RAISE EXCEPTION, not a NULL crash.
  ------------------------------------------------------------------
  _got_exception := false;
  BEGIN
    PERFORM public.ad_rank_breakdown(_missing_ad);
  EXCEPTION WHEN OTHERS THEN
    _got_exception := true;
  END;
  IF NOT _got_exception THEN
    RAISE EXCEPTION 'missing ad should raise, but returned normally';
  END IF;

  RAISE NOTICE 'ad_rank_breakdown edge cases passed';
END $$;

ROLLBACK;