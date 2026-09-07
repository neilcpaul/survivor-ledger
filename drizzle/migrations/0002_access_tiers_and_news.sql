ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'basic';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tier_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tier_check CHECK (tier IN ('basic','analysis'));

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.is_admin)
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;

DROP POLICY IF EXISTS "admins read all profiles" ON public.profiles;
CREATE POLICY "admins read all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

-- Privilege columns are never self-service: any request carrying an end-user
-- JWT (auth.uid() is not null) is rejected. Service-role writes have no uid.
CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (NEW.is_admin IS DISTINCT FROM OLD.is_admin OR NEW.tier IS DISTINCT FROM OLD.tier) THEN
    RAISE EXCEPTION 'is_admin and tier can only be changed by an administrator';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_privileges ON public.profiles;
CREATE TRIGGER guard_profile_privileges
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, is_admin, tier)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    lower(NEW.email) = 'neilcpaul@gmail.com',
    CASE WHEN lower(NEW.email) = 'neilcpaul@gmail.com' THEN 'analysis' ELSE 'basic' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

UPDATE public.profiles p
SET is_admin = true, tier = 'analysis'
FROM auth.users u
WHERE u.id = p.id AND lower(u.email) = 'neilcpaul@gmail.com';

CREATE TABLE IF NOT EXISTS public.news_articles (
  id text PRIMARY KEY,
  headline text,
  description text,
  published_at timestamptz,
  byline text,
  image_url text,
  image_caption text,
  article_url text,
  team_ids integer[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.news_articles TO anon;
GRANT SELECT ON public.news_articles TO authenticated;
GRANT ALL ON public.news_articles TO service_role;

ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "news public read" ON public.news_articles;
CREATE POLICY "news public read" ON public.news_articles FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS news_articles_published_idx ON public.news_articles (published_at DESC);
CREATE INDEX IF NOT EXISTS news_articles_team_ids_idx ON public.news_articles USING gin (team_ids);