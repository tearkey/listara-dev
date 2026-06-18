
-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
CREATE TYPE public.ad_status AS ENUM ('draft', 'pending', 'live', 'expired', 'removed', 'rejected');
CREATE TYPE public.ad_tier AS ENUM ('free', 'bumped', 'featured', 'sticky');
CREATE TYPE public.report_status AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- =========================================================
-- SHARED UTILS
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  phone TEXT,
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  default_city_id UUID,
  reputation INTEGER NOT NULL DEFAULT 0,
  is_banned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are publicly readable" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, email_verified)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email_confirmed_at IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- USER ROLES (separate table — never on profiles)
-- =========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- =========================================================
-- GEOGRAPHY
-- =========================================================
CREATE TABLE public.states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  country_code TEXT NOT NULL DEFAULT 'US',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.states TO anon, authenticated;
GRANT ALL ON public.states TO service_role;
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "States are public" ON public.states FOR SELECT USING (true);

CREATE TABLE public.cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID NOT NULL REFERENCES public.states(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  population INTEGER,
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (state_id, slug)
);
CREATE INDEX idx_cities_state ON public.cities(state_id);
CREATE INDEX idx_cities_featured ON public.cities(is_featured) WHERE is_featured = true;
GRANT SELECT ON public.cities TO anon, authenticated;
GRANT ALL ON public.cities TO service_role;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cities are public" ON public.cities FOR SELECT USING (true);

-- Now FK profiles.default_city_id
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_default_city_fk FOREIGN KEY (default_city_id) REFERENCES public.cities(id) ON DELETE SET NULL;

-- =========================================================
-- CATEGORIES
-- =========================================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_paid_only BOOLEAN NOT NULL DEFAULT false,
  base_price_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories are public" ON public.categories FOR SELECT USING (true);

CREATE TABLE public.subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, slug)
);
GRANT SELECT ON public.subcategories TO anon, authenticated;
GRANT ALL ON public.subcategories TO service_role;
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Subcategories are public" ON public.subcategories FOR SELECT USING (true);

-- =========================================================
-- ADS
-- =========================================================
CREATE TABLE public.ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id TEXT NOT NULL UNIQUE DEFAULT lower(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  city_id UUID NOT NULL REFERENCES public.cities(id),
  category_id UUID NOT NULL REFERENCES public.categories(id),
  subcategory_id UUID REFERENCES public.subcategories(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  body TEXT NOT NULL,
  price_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  contact_email TEXT,
  contact_phone TEXT,
  allow_messages BOOLEAN NOT NULL DEFAULT true,
  status public.ad_status NOT NULL DEFAULT 'pending',
  tier public.ad_tier NOT NULL DEFAULT 'free',
  tier_expires_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  bumped_at TIMESTAMPTZ,
  view_count INTEGER NOT NULL DEFAULT 0,
  report_count INTEGER NOT NULL DEFAULT 0,
  search_vector tsvector,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ads_city_cat_status ON public.ads(city_id, category_id, status);
CREATE INDEX idx_ads_status_posted ON public.ads(status, posted_at DESC);
CREATE INDEX idx_ads_user ON public.ads(user_id);
CREATE INDEX idx_ads_search ON public.ads USING GIN(search_vector);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads TO authenticated;
GRANT SELECT ON public.ads TO anon;
GRANT ALL ON public.ads TO service_role;
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read live ads" ON public.ads
  FOR SELECT USING (status = 'live' OR auth.uid() = user_id OR public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners can insert their ads" ON public.ads
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can update their ads" ON public.ads
  FOR UPDATE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners can delete their ads" ON public.ads
  FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_ads_updated_at BEFORE UPDATE ON public.ads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Search vector maintenance
CREATE OR REPLACE FUNCTION public.ads_update_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A')
                    || setweight(to_tsvector('english', COALESCE(NEW.body, '')), 'B');
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_ads_search BEFORE INSERT OR UPDATE OF title, body ON public.ads
  FOR EACH ROW EXECUTE FUNCTION public.ads_update_search_vector();

-- Ranking score function (called by sort, kept transparent + cheap)
CREATE OR REPLACE FUNCTION public.ad_rank_score(
  _tier public.ad_tier,
  _bumped_at TIMESTAMPTZ,
  _posted_at TIMESTAMPTZ,
  _views INTEGER,
  _reports INTEGER
) RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT
    CASE _tier
      WHEN 'sticky' THEN 1000
      WHEN 'featured' THEN 500
      WHEN 'bumped' THEN 100
      ELSE 0
    END
    + GREATEST(0, 100 - EXTRACT(EPOCH FROM (now() - COALESCE(_bumped_at, _posted_at, now()))) / 86400.0 * 14)
    + 5 * ln(GREATEST(_views, 0) + 1)
    - 25 * COALESCE(_reports, 0)
$$;

-- =========================================================
-- AD IMAGES
-- =========================================================
CREATE TABLE public.ad_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ad_images_ad ON public.ad_images(ad_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_images TO authenticated;
GRANT SELECT ON public.ad_images TO anon;
GRANT ALL ON public.ad_images TO service_role;
ALTER TABLE public.ad_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view ad images" ON public.ad_images FOR SELECT USING (true);
CREATE POLICY "Owners manage their ad images" ON public.ad_images
  FOR ALL USING (EXISTS (SELECT 1 FROM public.ads a WHERE a.id = ad_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ads a WHERE a.id = ad_id AND a.user_id = auth.uid()));

-- =========================================================
-- IN-APP MESSAGES (poster <-> interested user)
-- =========================================================
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_recipient ON public.messages(recipient_id, read_at);
CREATE INDEX idx_messages_ad ON public.messages(ad_id);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can read messages" ON public.messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "Senders can insert messages" ON public.messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Recipients can mark read" ON public.messages
  FOR UPDATE USING (auth.uid() = recipient_id);

-- =========================================================
-- REPORTS
-- =========================================================
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  detail TEXT,
  status public.report_status NOT NULL DEFAULT 'open',
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_ad ON public.reports(ad_id);
CREATE INDEX idx_reports_status ON public.reports(status);
GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create reports" ON public.reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id OR reporter_id IS NULL);
CREATE POLICY "Reporter can see own reports" ON public.reports
  FOR SELECT USING (auth.uid() = reporter_id OR public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Moderators can manage reports" ON public.reports
  FOR UPDATE USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- BANNED KEYWORDS (moderation config)
-- =========================================================
CREATE TABLE public.banned_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  severity TEXT NOT NULL DEFAULT 'block', -- 'block' | 'review'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.banned_keywords TO authenticated;
GRANT ALL ON public.banned_keywords TO service_role;
ALTER TABLE public.banned_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mods can read banned keywords" ON public.banned_keywords
  FOR SELECT USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- PAYMENTS (for paid promotions)
-- =========================================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_id UUID REFERENCES public.ads(id) ON DELETE SET NULL,
  product_kind TEXT NOT NULL, -- 'bump' | 'featured' | 'sticky' | 'paid_post'
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status public.payment_status NOT NULL DEFAULT 'pending',
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_session_id TEXT,
  provider_payment_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_user ON public.payments(user_id);
CREATE INDEX idx_payments_ad ON public.payments(ad_id);
GRANT SELECT, INSERT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their payments" ON public.payments
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- AUDIT LOG (moderator/admin actions)
-- =========================================================
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id UUID,
  detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_actor ON public.audit_log(actor_id);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read audit log" ON public.audit_log
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Mods can insert audit entries" ON public.audit_log
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));
