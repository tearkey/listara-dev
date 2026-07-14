-- Unit + integration tests for public.ad_rank_breakdown(uuid).
-- Runs inside a transaction that is rolled back at the end so no data
-- persists in the database. Uses RAISE EXCEPTION on failure so
-- `psql -v ON_ERROR_STOP=1` exits non-zero.

BEGIN;
SET LOCAL role = 'postgres';

-- Bypass the admin gate in ad_rank_breakdown by shadowing has_role in a
-- transient search_path schema. The real function stays untouched.
CREATE SCHEMA IF NOT EXISTS _rank_test;
CREATE OR REPLACE FUNCTION _rank_test.has_role(_user_id uuid, _role public.app_role)
  RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
SET LOCAL search_path = _rank_test, public;

DO $$
DECLARE
  _uid uuid;
  _city uuid;
  _cat uuid;
  _ad uuid := gen_random_uuid();
  _r jsonb;
  _components jsonb;
  _labels text[];
  _tier_bonus numeric;
  _recency numeric;
  _views_component numeric;
  _report_penalty numeric;
  _score numeric;
BEGIN
  -- Fixture ad: featured tier, freshly posted, 0 views/reports.
  SELECT id INTO _uid FROM auth.users LIMIT 1;
  IF _uid IS NULL THEN _uid := gen_random_uuid(); END IF;
  SELECT id INTO _city FROM public.cities LIMIT 1;
  SELECT id INTO _cat  FROM public.categories LIMIT 1;

  INSERT INTO public.ads (id, user_id, city_id, category_id, title, slug, body,
                          status, tier, posted_at, bumped_at, view_count)
  VALUES (_ad, _uid, _city, _cat, 'rank-test', 'rank-test-'||_ad, 'body',
          'live', 'featured', now(), now(), 0);

  _r := public.ad_rank_breakdown(_ad);

  -- Shape assertions.
  IF _r->>'ad_id' <> _ad::text THEN RAISE EXCEPTION 'ad_id mismatch: %', _r; END IF;
  IF _r->>'tier' <> 'featured' THEN RAISE EXCEPTION 'tier mismatch: %', _r->>'tier'; END IF;
  IF (_r->>'views')::int <> 0 THEN RAISE EXCEPTION 'views mismatch'; END IF;
  IF (_r->>'reports')::int <> 0 THEN RAISE EXCEPTION 'reports mismatch'; END IF;

  _components := _r->'components';
  IF jsonb_array_length(_components) <> 4 THEN
    RAISE EXCEPTION 'expected 4 components, got %', jsonb_array_length(_components);
  END IF;

  -- Explanations must stay stable (guards against silent copy edits).
  SELECT array_agg(elem->>'label' ORDER BY ord)
    INTO _labels
    FROM jsonb_array_elements(_components) WITH ORDINALITY AS t(elem, ord);
  IF _labels[1] NOT LIKE 'Tier bonus%' THEN RAISE EXCEPTION 'label[1]=%', _labels[1]; END IF;
  IF _labels[2] <> 'Recency' THEN RAISE EXCEPTION 'label[2]=%', _labels[2]; END IF;
  IF _labels[3] <> 'View boost' THEN RAISE EXCEPTION 'label[3]=%', _labels[3]; END IF;
  IF _labels[4] <> 'Report penalty' THEN RAISE EXCEPTION 'label[4]=%', _labels[4]; END IF;

  _tier_bonus     := (_components->0->>'value')::numeric;
  _recency        := (_components->1->>'value')::numeric;
  _views_component:= (_components->2->>'value')::numeric;
  _report_penalty := (_components->3->>'value')::numeric;
  _score          := (_r->>'score')::numeric;

  IF _tier_bonus <> 500 THEN RAISE EXCEPTION 'featured tier bonus expected 500, got %', _tier_bonus; END IF;
  IF _recency < 99.9 OR _recency > 100 THEN RAISE EXCEPTION 'fresh ad recency expected ~100, got %', _recency; END IF;
  IF _views_component <> 0 THEN RAISE EXCEPTION '0 views should give 0 boost, got %', _views_component; END IF;
  IF _report_penalty <> 0 THEN RAISE EXCEPTION '0 reports should give 0 penalty, got %', _report_penalty; END IF;
  IF abs(_score - (_tier_bonus + _recency + _views_component + _report_penalty)) > 0.01 THEN
    RAISE EXCEPTION 'score % != sum of components', _score;
  END IF;

  -- Add views + reports and recompute.
  UPDATE public.ads SET view_count = 148 WHERE id = _ad;
  INSERT INTO public.reports (ad_id, reason, status) VALUES
    (_ad, 'spam', 'open'), (_ad, 'spam', 'open'), (_ad, 'spam', 'resolved');

  _r := public.ad_rank_breakdown(_ad);
  IF (_r->>'reports')::int <> 3 THEN RAISE EXCEPTION 'expected 3 reports (all), got %', _r->>'reports'; END IF;
  _components := _r->'components';
  _views_component := (_components->2->>'value')::numeric;
  _report_penalty  := (_components->3->>'value')::numeric;
  -- 5 * ln(149) ≈ 25.03
  IF _views_component < 24 OR _views_component > 26 THEN
    RAISE EXCEPTION 'view boost for 148 views expected ~25, got %', _views_component;
  END IF;
  IF _report_penalty <> -75 THEN
    RAISE EXCEPTION 'report penalty for 3 reports expected -75, got %', _report_penalty;
  END IF;

  -- Ordering: sticky > featured > bumped > free at t=0, 0 views, 0 reports.
  DECLARE
    _tiers ad_tier[] := ARRAY['free','bumped','featured','sticky']::ad_tier[];
    _scores numeric[] := ARRAY[]::numeric[];
    _t ad_tier;
    _tmp_id uuid;
  BEGIN
    FOREACH _t IN ARRAY _tiers LOOP
      _tmp_id := gen_random_uuid();
      INSERT INTO public.ads (id, user_id, city_id, category_id, title, slug, body,
                              status, tier, posted_at, bumped_at, view_count)
      VALUES (_tmp_id, _uid, _city, _cat, 'rt-'||_t, 'rt-'||_t||'-'||_tmp_id, 'b',
              'live', _t, now(), now(), 0);
      _scores := _scores || ((public.ad_rank_breakdown(_tmp_id))->>'score')::numeric;
    END LOOP;
    IF NOT (_scores[1] < _scores[2] AND _scores[2] < _scores[3] AND _scores[3] < _scores[4]) THEN
      RAISE EXCEPTION 'tier ordering broken: %', _scores;
    END IF;
  END;

  RAISE NOTICE 'ad_rank_breakdown tests passed';
END $$;

ROLLBACK;