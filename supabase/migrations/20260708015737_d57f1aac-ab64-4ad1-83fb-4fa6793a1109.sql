-- ============================================================
-- Credits system + per-city posting cost + multi-city seed
-- ============================================================

CREATE TABLE public.user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT balance_non_negative CHECK (balance_cents >= 0)
);
GRANT SELECT ON public.user_credits TO authenticated;
GRANT ALL ON public.user_credits TO service_role;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own credit balance"
  ON public.user_credits FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ad_id UUID REFERENCES public.ads(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_credit_tx_user ON public.credit_transactions(user_id, created_at DESC);
CREATE UNIQUE INDEX uniq_credit_tx_topup ON public.credit_transactions(invoice_id)
  WHERE invoice_id IS NOT NULL AND reason = 'topup';
GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own credit history"
  ON public.credit_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'sticky',
  ADD COLUMN IF NOT EXISTS credit_cents INTEGER;

CREATE OR REPLACE FUNCTION public.spend_credits(_amount_cents INTEGER, _reason TEXT, _ad_id UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _new_balance INTEGER;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _amount_cents <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  INSERT INTO public.user_credits(user_id, balance_cents) VALUES (_uid, 0) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.user_credits
    SET balance_cents = balance_cents - _amount_cents, updated_at = now()
    WHERE user_id = _uid AND balance_cents >= _amount_cents
    RETURNING balance_cents INTO _new_balance;
  IF _new_balance IS NULL THEN RETURN FALSE; END IF;
  INSERT INTO public.credit_transactions(user_id, delta_cents, reason, ad_id)
    VALUES (_uid, -_amount_cents, _reason, _ad_id);
  RETURN TRUE;
END; $$;

CREATE OR REPLACE FUNCTION public.add_credits_from_invoice(_user_id UUID, _amount_cents INTEGER, _invoice_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _existing INTEGER;
BEGIN
  SELECT 1 INTO _existing FROM public.credit_transactions
    WHERE invoice_id = _invoice_id AND reason = 'topup' LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN FALSE; END IF;
  INSERT INTO public.user_credits(user_id, balance_cents) VALUES (_user_id, _amount_cents)
    ON CONFLICT (user_id) DO UPDATE
      SET balance_cents = public.user_credits.balance_cents + EXCLUDED.balance_cents,
          updated_at = now();
  INSERT INTO public.credit_transactions(user_id, delta_cents, reason, invoice_id)
    VALUES (_user_id, _amount_cents, 'topup', _invoice_id);
  RETURN TRUE;
END; $$;

REVOKE ALL ON FUNCTION public.add_credits_from_invoice(UUID, INTEGER, UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_credits_from_invoice(UUID, INTEGER, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.spend_credits(INTEGER, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_user_credits()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_touch_user_credits ON public.user_credits;
CREATE TRIGGER trg_touch_user_credits BEFORE UPDATE ON public.user_credits
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_credits();

-- Seed major US cities across all 50 states + DC as featured
WITH v(code,name,slug) AS (VALUES
('AL','Birmingham','birmingham'),('AL','Montgomery','montgomery'),('AL','Huntsville','huntsville'),('AL','Mobile','mobile'),('AL','Tuscaloosa','tuscaloosa'),
('AK','Anchorage','anchorage'),('AK','Fairbanks','fairbanks'),('AK','Juneau','juneau'),('AK','Wasilla','wasilla'),
('AZ','Phoenix','phoenix'),('AZ','Tucson','tucson'),('AZ','Mesa','mesa'),('AZ','Chandler','chandler'),('AZ','Scottsdale','scottsdale'),('AZ','Glendale','glendale'),('AZ','Tempe','tempe'),('AZ','Flagstaff','flagstaff'),
('AR','Little Rock','little-rock'),('AR','Fort Smith','fort-smith'),('AR','Fayetteville','fayetteville'),('AR','Springdale','springdale'),('AR','Jonesboro','jonesboro'),
('CA','Los Angeles','los-angeles'),('CA','San Diego','san-diego'),('CA','San Jose','san-jose'),('CA','San Francisco','san-francisco'),('CA','Fresno','fresno'),('CA','Sacramento','sacramento'),('CA','Long Beach','long-beach'),('CA','Oakland','oakland'),('CA','Bakersfield','bakersfield'),('CA','Anaheim','anaheim'),('CA','Riverside','riverside'),('CA','Santa Ana','santa-ana'),('CA','Irvine','irvine'),('CA','San Bernardino','san-bernardino'),
('CO','Denver','denver'),('CO','Colorado Springs','colorado-springs'),('CO','Aurora','aurora'),('CO','Fort Collins','fort-collins'),('CO','Lakewood','lakewood'),('CO','Boulder','boulder'),('CO','Pueblo','pueblo'),
('CT','Bridgeport','bridgeport'),('CT','New Haven','new-haven'),('CT','Stamford','stamford'),('CT','Hartford','hartford'),('CT','Waterbury','waterbury'),('CT','Norwalk','norwalk'),
('DE','Wilmington','wilmington'),('DE','Dover','dover'),('DE','Newark','newark'),
('DC','Washington','washington'),
('FL','Jacksonville','jacksonville'),('FL','Miami','miami'),('FL','Tampa','tampa'),('FL','Orlando','orlando'),('FL','St. Petersburg','st-petersburg'),('FL','Hialeah','hialeah'),('FL','Fort Lauderdale','fort-lauderdale'),('FL','Tallahassee','tallahassee'),('FL','Cape Coral','cape-coral'),('FL','Gainesville','gainesville'),
('GA','Atlanta','atlanta'),('GA','Augusta','augusta'),('GA','Columbus','columbus'),('GA','Macon','macon'),('GA','Savannah','savannah'),('GA','Athens','athens'),('GA','Sandy Springs','sandy-springs'),
('HI','Honolulu','honolulu'),('HI','Hilo','hilo'),('HI','Kailua','kailua'),('HI','Waipahu','waipahu'),
('ID','Boise','boise'),('ID','Meridian','meridian'),('ID','Nampa','nampa'),('ID','Idaho Falls','idaho-falls'),('ID','Pocatello','pocatello'),
('IL','Chicago','chicago'),('IL','Aurora','aurora'),('IL','Rockford','rockford'),('IL','Joliet','joliet'),('IL','Naperville','naperville'),('IL','Springfield','springfield'),('IL','Peoria','peoria'),('IL','Elgin','elgin'),
('IN','Indianapolis','indianapolis'),('IN','Fort Wayne','fort-wayne'),('IN','Evansville','evansville'),('IN','South Bend','south-bend'),('IN','Carmel','carmel'),('IN','Bloomington','bloomington'),
('IA','Des Moines','des-moines'),('IA','Cedar Rapids','cedar-rapids'),('IA','Davenport','davenport'),('IA','Sioux City','sioux-city'),('IA','Iowa City','iowa-city'),
('KS','Wichita','wichita'),('KS','Overland Park','overland-park'),('KS','Kansas City','kansas-city'),('KS','Topeka','topeka'),('KS','Olathe','olathe'),
('KY','Louisville','louisville'),('KY','Lexington','lexington'),('KY','Bowling Green','bowling-green'),('KY','Owensboro','owensboro'),('KY','Covington','covington'),
('LA','New Orleans','new-orleans'),('LA','Baton Rouge','baton-rouge'),('LA','Shreveport','shreveport'),('LA','Lafayette','lafayette'),('LA','Lake Charles','lake-charles'),
('ME','Portland','portland'),('ME','Lewiston','lewiston'),('ME','Bangor','bangor'),('ME','Augusta','augusta'),
('MD','Baltimore','baltimore'),('MD','Frederick','frederick'),('MD','Rockville','rockville'),('MD','Gaithersburg','gaithersburg'),('MD','Bowie','bowie'),('MD','Annapolis','annapolis'),
('MA','Boston','boston'),('MA','Worcester','worcester'),('MA','Springfield','springfield'),('MA','Cambridge','cambridge'),('MA','Lowell','lowell'),('MA','Brockton','brockton'),
('MI','Detroit','detroit'),('MI','Grand Rapids','grand-rapids'),('MI','Warren','warren'),('MI','Sterling Heights','sterling-heights'),('MI','Ann Arbor','ann-arbor'),('MI','Lansing','lansing'),('MI','Flint','flint'),
('MN','Minneapolis','minneapolis'),('MN','Saint Paul','saint-paul'),('MN','Rochester','rochester'),('MN','Duluth','duluth'),('MN','Bloomington','bloomington'),
('MS','Jackson','jackson'),('MS','Gulfport','gulfport'),('MS','Southaven','southaven'),('MS','Hattiesburg','hattiesburg'),('MS','Biloxi','biloxi'),
('MO','Kansas City','kansas-city'),('MO','Saint Louis','saint-louis'),('MO','Springfield','springfield'),('MO','Columbia','columbia'),('MO','Independence','independence'),
('MT','Billings','billings'),('MT','Missoula','missoula'),('MT','Great Falls','great-falls'),('MT','Bozeman','bozeman'),('MT','Helena','helena'),
('NE','Omaha','omaha'),('NE','Lincoln','lincoln'),('NE','Bellevue','bellevue'),('NE','Grand Island','grand-island'),
('NV','Las Vegas','las-vegas'),('NV','Henderson','henderson'),('NV','Reno','reno'),('NV','North Las Vegas','north-las-vegas'),('NV','Sparks','sparks'),('NV','Carson City','carson-city'),
('NH','Manchester','manchester'),('NH','Nashua','nashua'),('NH','Concord','concord'),('NH','Dover','dover'),
('NJ','Newark','newark'),('NJ','Jersey City','jersey-city'),('NJ','Paterson','paterson'),('NJ','Elizabeth','elizabeth'),('NJ','Edison','edison'),('NJ','Trenton','trenton'),
('NM','Albuquerque','albuquerque'),('NM','Las Cruces','las-cruces'),('NM','Rio Rancho','rio-rancho'),('NM','Santa Fe','santa-fe'),('NM','Roswell','roswell'),
('NY','New York','new-york'),('NY','Buffalo','buffalo'),('NY','Rochester','rochester'),('NY','Yonkers','yonkers'),('NY','Syracuse','syracuse'),('NY','Albany','albany'),
('NC','Charlotte','charlotte'),('NC','Raleigh','raleigh'),('NC','Greensboro','greensboro'),('NC','Durham','durham'),('NC','Winston-Salem','winston-salem'),('NC','Fayetteville','fayetteville'),('NC','Cary','cary'),
('ND','Fargo','fargo'),('ND','Bismarck','bismarck'),('ND','Grand Forks','grand-forks'),('ND','Minot','minot'),
('OH','Columbus','columbus'),('OH','Cleveland','cleveland'),('OH','Cincinnati','cincinnati'),('OH','Toledo','toledo'),('OH','Akron','akron'),('OH','Dayton','dayton'),
('OK','Oklahoma City','oklahoma-city'),('OK','Tulsa','tulsa'),('OK','Norman','norman'),('OK','Broken Arrow','broken-arrow'),('OK','Edmond','edmond'),
('OR','Portland','portland'),('OR','Salem','salem'),('OR','Eugene','eugene'),('OR','Gresham','gresham'),('OR','Hillsboro','hillsboro'),('OR','Bend','bend'),
('PA','Philadelphia','philadelphia'),('PA','Pittsburgh','pittsburgh'),('PA','Allentown','allentown'),('PA','Erie','erie'),('PA','Reading','reading'),('PA','Scranton','scranton'),('PA','Harrisburg','harrisburg'),
('RI','Providence','providence'),('RI','Warwick','warwick'),('RI','Cranston','cranston'),('RI','Pawtucket','pawtucket'),
('SC','Charleston','charleston'),('SC','Columbia','columbia'),('SC','North Charleston','north-charleston'),('SC','Mount Pleasant','mount-pleasant'),('SC','Greenville','greenville'),
('SD','Sioux Falls','sioux-falls'),('SD','Rapid City','rapid-city'),('SD','Aberdeen','aberdeen'),('SD','Brookings','brookings'),
('TN','Nashville','nashville'),('TN','Memphis','memphis'),('TN','Knoxville','knoxville'),('TN','Chattanooga','chattanooga'),('TN','Clarksville','clarksville'),('TN','Murfreesboro','murfreesboro'),
('TX','Houston','houston'),('TX','San Antonio','san-antonio'),('TX','Dallas','dallas'),('TX','Austin','austin'),('TX','Fort Worth','fort-worth'),('TX','El Paso','el-paso'),('TX','Arlington','arlington'),('TX','Corpus Christi','corpus-christi'),('TX','Plano','plano'),('TX','Laredo','laredo'),('TX','Lubbock','lubbock'),('TX','Garland','garland'),('TX','Irving','irving'),('TX','Amarillo','amarillo'),
('UT','Salt Lake City','salt-lake-city'),('UT','West Valley City','west-valley-city'),('UT','Provo','provo'),('UT','West Jordan','west-jordan'),('UT','Orem','orem'),('UT','Sandy','sandy'),('UT','Ogden','ogden'),
('VT','Burlington','burlington'),('VT','Montpelier','montpelier'),('VT','Rutland','rutland'),
('VA','Virginia Beach','virginia-beach'),('VA','Norfolk','norfolk'),('VA','Chesapeake','chesapeake'),('VA','Richmond','richmond'),('VA','Newport News','newport-news'),('VA','Alexandria','alexandria'),('VA','Hampton','hampton'),('VA','Arlington','arlington'),
('WA','Seattle','seattle'),('WA','Spokane','spokane'),('WA','Tacoma','tacoma'),('WA','Vancouver','vancouver'),('WA','Bellevue','bellevue'),('WA','Kent','kent'),('WA','Everett','everett'),('WA','Olympia','olympia'),
('WV','Charleston','charleston'),('WV','Huntington','huntington'),('WV','Morgantown','morgantown'),('WV','Parkersburg','parkersburg'),
('WI','Milwaukee','milwaukee'),('WI','Madison','madison'),('WI','Green Bay','green-bay'),('WI','Kenosha','kenosha'),('WI','Racine','racine'),('WI','Appleton','appleton'),
('WY','Cheyenne','cheyenne'),('WY','Casper','casper'),('WY','Laramie','laramie'),('WY','Gillette','gillette')
),
resolved AS (SELECT s.id AS state_id, v.name, v.slug FROM v JOIN public.states s ON s.code=v.code)
INSERT INTO public.cities(state_id, name, slug, is_featured)
SELECT state_id, name, slug, true FROM resolved
ON CONFLICT (state_id, slug) DO UPDATE SET is_featured=true, name=EXCLUDED.name;