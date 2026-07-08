-- Payment status enum
DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pending', 'confirming', 'confirmed', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Invoices table
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nowpayments_order_id TEXT UNIQUE,
  nowpayments_payment_id TEXT UNIQUE,
  pay_amount NUMERIC(20, 8),
  pay_currency VARCHAR(10),
  price_amount NUMERIC(12, 2),
  price_currency VARCHAR(10) DEFAULT 'USD',
  invoice_url TEXT,
  status public.payment_status NOT NULL DEFAULT 'pending',
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX invoices_user_id_idx ON public.invoices(user_id);
CREATE INDEX invoices_listing_id_idx ON public.invoices(listing_id);
CREATE INDEX invoices_status_idx ON public.invoices(status);

-- Grants (required — Data API does not grant these by default)
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

-- RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Users can read only their own invoices. Inserts/updates go through the
-- webhook + server function using service_role, so no anon/authenticated
-- write policies are exposed.
CREATE POLICY "Users can view own invoices"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
