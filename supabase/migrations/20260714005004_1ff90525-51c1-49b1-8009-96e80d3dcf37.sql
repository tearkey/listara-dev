
CREATE OR REPLACE FUNCTION public.ad_rank_breakdown(_ad_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ad RECORD;
  _reports INTEGER;
  _tier_bonus NUMERIC;
  _recency NUMERIC;
  _view_boost NUMERIC;
  _report_penalty NUMERIC;
  _age_days NUMERIC;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'superadmin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  SELECT id, title, short_id, tier, bumped_at, posted_at, view_count, status
    INTO _ad
    FROM public.ads
    WHERE id = _ad_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ad not found'; END IF;

  SELECT COUNT(*)::INTEGER INTO _reports
    FROM public.reports WHERE ad_id = _ad_id;

  _tier_bonus := CASE _ad.tier
    WHEN 'sticky' THEN 1000
    WHEN 'featured' THEN 500
    WHEN 'bumped' THEN 100
    ELSE 0 END;

  _age_days := EXTRACT(EPOCH FROM (now() - COALESCE(_ad.bumped_at, _ad.posted_at, now()))) / 86400.0;
  _recency := GREATEST(0, 100 - _age_days * 14);
  _view_boost := 5 * ln(GREATEST(_ad.view_count, 0) + 1);
  _report_penalty := -25 * COALESCE(_reports, 0);

  RETURN jsonb_build_object(
    'ad_id', _ad.id,
    'short_id', _ad.short_id,
    'title', _ad.title,
    'status', _ad.status,
    'tier', _ad.tier,
    'age_days', ROUND(_age_days::NUMERIC, 2),
    'views', _ad.view_count,
    'reports', _reports,
    'score', ROUND((_tier_bonus + _recency + _view_boost + _report_penalty)::NUMERIC, 2),
    'components', jsonb_build_array(
      jsonb_build_object('label', 'Tier bonus (' || _ad.tier || ')', 'value', ROUND(_tier_bonus::NUMERIC, 2),
        'explain', 'Sticky=1000, featured=500, bumped=100, free=0.'),
      jsonb_build_object('label', 'Recency', 'value', ROUND(_recency::NUMERIC, 2),
        'explain', 'Starts at 100 and decays 14 points/day from posted_at (or last bump).'),
      jsonb_build_object('label', 'View boost', 'value', ROUND(_view_boost::NUMERIC, 2),
        'explain', '5 × ln(views + 1) — diminishing returns from popularity.'),
      jsonb_build_object('label', 'Report penalty', 'value', ROUND(_report_penalty::NUMERIC, 2),
        'explain', '-25 per moderation report received.')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ad_rank_breakdown(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ad_rank_breakdown(UUID) TO authenticated;
