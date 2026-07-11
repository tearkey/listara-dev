-- Hide seller contact info from anonymous visitors.
-- Anonymous visitors can still browse live ads, but cannot read contact_email or contact_phone.
-- Signed-in users (authenticated) still see contact info — they went through auth and messaging is available.
REVOKE SELECT (contact_email, contact_phone) ON public.ads FROM anon;
NOTIFY pgrst, 'reload schema';