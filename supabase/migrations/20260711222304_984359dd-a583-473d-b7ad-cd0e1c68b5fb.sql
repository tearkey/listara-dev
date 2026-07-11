CREATE TABLE public.security_scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  total INTEGER NOT NULL DEFAULT 0,
  critical INTEGER NOT NULL DEFAULT 0,
  high INTEGER NOT NULL DEFAULT 0,
  medium INTEGER NOT NULL DEFAULT 0,
  low INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

GRANT SELECT, INSERT, DELETE ON public.security_scan_runs TO authenticated;
GRANT ALL ON public.security_scan_runs TO service_role;

ALTER TABLE public.security_scan_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view scan runs"
  ON public.security_scan_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Admins can insert scan runs"
  ON public.security_scan_runs FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin')) AND created_by = auth.uid());

CREATE POLICY "Admins can delete scan runs"
  ON public.security_scan_runs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE INDEX security_scan_runs_created_at_idx ON public.security_scan_runs (created_at DESC);