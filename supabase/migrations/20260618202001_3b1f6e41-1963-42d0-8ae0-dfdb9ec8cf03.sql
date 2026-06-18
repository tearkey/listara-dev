
DROP POLICY IF EXISTS "Anyone can read live ads" ON public.ads;

CREATE POLICY "Public can read live ads" ON public.ads
  FOR SELECT TO anon, authenticated USING (status = 'live');

CREATE POLICY "Owners can read own ads" ON public.ads
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Moderators can read all ads" ON public.ads
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));
