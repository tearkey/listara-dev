-- ============================================================================
-- PERSONALS SAFETY: SOLICITATION KEYWORD FILTER
-- ============================================================================
-- The personals category posts go live without manual review (product
-- decision), so the automated keyword filter is the compliance layer against
-- commercial-sex solicitation (FOSTA-SESTA). Matching in createAd is
-- substring-based across ALL categories, so entries must be phrases that
-- cannot appear innocently ("escort" alone would match "Ford Escort").
--
-- severity 'block'  -> post rejected outright
-- severity 'review' -> post held for moderator review
-- Admins can extend this list at any time (banned_keywords table).

INSERT INTO public.banned_keywords (keyword, severity) VALUES
  -- Unambiguous solicitation phrasing
  ('escort service', 'block'),
  ('escorts available', 'block'),
  ('incall', 'block'),
  ('outcall', 'block'),
  ('roses per hour', 'block'),
  ('donations expected', 'block'),
  ('pay for play', 'block'),
  ('cash for company', 'block'),
  ('full service massage', 'block'),
  ('generous gentlemen only', 'block'),
  -- Grey-area terms: held for a moderator instead of auto-blocked
  ('happy ending', 'review'),
  ('sugar daddy', 'review'),
  ('sugar baby', 'review'),
  ('generous man', 'review'),
  ('donation friendly', 'review')
ON CONFLICT (keyword) DO NOTHING;
