-- Fully lock seller contact info out of the Data API.
-- Reads now flow through server-side functions that authorize the caller first
-- (owner-only edit view, or authenticated reveal on a live ad).
REVOKE SELECT (contact_email, contact_phone) ON public.ads FROM authenticated;
-- INSERT/UPDATE column privileges are separate and remain intact, so owners
-- can still write to these columns when posting or editing.
NOTIFY pgrst, 'reload schema';