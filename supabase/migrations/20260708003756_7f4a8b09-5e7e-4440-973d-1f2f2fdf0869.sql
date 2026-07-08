ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS sticky_until timestamptz;
CREATE INDEX IF NOT EXISTS idx_listings_sticky_until ON public.listings(sticky_until) WHERE sticky_until IS NOT NULL;