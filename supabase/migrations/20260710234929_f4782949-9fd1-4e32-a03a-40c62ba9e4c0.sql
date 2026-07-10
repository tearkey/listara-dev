
-- Fast filter for paid-invoice aggregates
CREATE INDEX IF NOT EXISTS idx_invoices_paid_created
  ON public.invoices (created_at)
  WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS idx_ads_created_at ON public.ads (created_at);
CREATE INDEX IF NOT EXISTS idx_ads_posted_at ON public.ads (posted_at);

-- ---------------------------------------------------------------------------
-- Summary KPIs for a custom date range
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_analytics_summary(
  _from timestamptz,
  _to   timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _net_cents   BIGINT;
  _orders      INTEGER;
  _aov_cents   NUMERIC;
  _new_users   INTEGER;
  _new_ads     INTEGER;
  _paid_ads    INTEGER;
  _live_ads    INTEGER;
  _payers      INTEGER;
  _repeat      INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  SELECT COALESCE(SUM(price_amount) * 100, 0)::BIGINT,
         COUNT(*)::INTEGER
    INTO _net_cents, _orders
    FROM public.invoices
    WHERE status = 'paid'
      AND created_at >= _from AND created_at < _to;

  _aov_cents := CASE WHEN _orders > 0 THEN _net_cents::NUMERIC / _orders ELSE 0 END;

  SELECT COUNT(*)::INTEGER INTO _new_users
    FROM auth.users
    WHERE created_at >= _from AND created_at < _to;

  SELECT COUNT(*)::INTEGER INTO _new_ads
    FROM public.ads
    WHERE created_at >= _from AND created_at < _to;

  SELECT COUNT(*)::INTEGER INTO _paid_ads
    FROM public.ads
    WHERE created_at >= _from AND created_at < _to
      AND tier <> 'free';

  SELECT COUNT(*)::INTEGER INTO _live_ads
    FROM public.ads
    WHERE status = 'live'
      AND (expires_at IS NULL OR expires_at > now());

  -- Renewal rate proxy: % of paying users in the range who paid more than once (lifetime)
  SELECT COUNT(DISTINCT user_id)::INTEGER INTO _payers
    FROM public.invoices
    WHERE status = 'paid'
      AND created_at >= _from AND created_at < _to;

  SELECT COUNT(*)::INTEGER INTO _repeat
    FROM (
      SELECT user_id
        FROM public.invoices
        WHERE status = 'paid'
        GROUP BY user_id
        HAVING COUNT(*) > 1
    ) r
    WHERE r.user_id IN (
      SELECT user_id FROM public.invoices
        WHERE status = 'paid'
          AND created_at >= _from AND created_at < _to
    );

  RETURN jsonb_build_object(
    'range', jsonb_build_object('from', _from, 'to', _to),
    'revenue', jsonb_build_object(
      'net_cents', _net_cents,
      'orders', _orders,
      'aov_cents', ROUND(_aov_cents)::BIGINT
    ),
    'ads', jsonb_build_object(
      'new_ads', _new_ads,
      'paid_ads', _paid_ads,
      'live_ads', _live_ads
    ),
    'funnel', jsonb_build_object(
      'new_users', _new_users,
      'paying_users', _payers,
      -- visitor→paid-ad conversion proxy: paying users / new signups in range
      'conversion_rate', CASE WHEN _new_users > 0
        THEN ROUND((_payers::NUMERIC / _new_users) * 10000) / 10000
        ELSE 0 END,
      'renewal_rate', CASE WHEN _payers > 0
        THEN ROUND((_repeat::NUMERIC / _payers) * 10000) / 10000
        ELSE 0 END
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Bucketed time series for charts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_analytics_series(
  _from   timestamptz,
  _to     timestamptz,
  _bucket text DEFAULT 'day'
) RETURNS TABLE (
  bucket_start   timestamptz,
  revenue_cents  BIGINT,
  orders         INTEGER,
  new_ads        INTEGER,
  paid_ads       INTEGER
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _step interval;
  _trunc text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  IF _bucket NOT IN ('day','week','month') THEN
    RAISE EXCEPTION 'bucket must be day|week|month';
  END IF;

  _trunc := _bucket;
  _step  := ('1 ' || _bucket)::interval;

  RETURN QUERY
  WITH buckets AS (
    SELECT gs AS bucket_start
      FROM generate_series(date_trunc(_trunc, _from), date_trunc(_trunc, _to - interval '1 second'), _step) gs
  ),
  inv AS (
    SELECT date_trunc(_trunc, created_at) AS b,
           COALESCE(SUM(price_amount) * 100, 0)::BIGINT AS revenue_cents,
           COUNT(*)::INTEGER AS orders
      FROM public.invoices
      WHERE status = 'paid' AND created_at >= _from AND created_at < _to
      GROUP BY 1
  ),
  ads_all AS (
    SELECT date_trunc(_trunc, created_at) AS b,
           COUNT(*)::INTEGER AS new_ads,
           COUNT(*) FILTER (WHERE tier <> 'free')::INTEGER AS paid_ads
      FROM public.ads
      WHERE created_at >= _from AND created_at < _to
      GROUP BY 1
  )
  SELECT b.bucket_start,
         COALESCE(inv.revenue_cents, 0)::BIGINT,
         COALESCE(inv.orders, 0)::INTEGER,
         COALESCE(ads_all.new_ads, 0)::INTEGER,
         COALESCE(ads_all.paid_ads, 0)::INTEGER
    FROM buckets b
    LEFT JOIN inv     ON inv.b     = b.bucket_start
    LEFT JOIN ads_all ON ads_all.b = b.bucket_start
   ORDER BY b.bucket_start;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_analytics_summary(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_analytics_series(timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_analytics_summary(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_series(timestamptz, timestamptz, text)    TO authenticated;
