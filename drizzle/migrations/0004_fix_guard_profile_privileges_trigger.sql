DROP TRIGGER IF EXISTS guard_profile_privileges ON public.profiles;

CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The handle_new_user signup trigger runs without an authenticated JWT
  -- (auth.uid() IS NULL) and is allowed to create rows with safe defaults.
  IF auth.uid() IS NULL THEN
    IF NEW.is_admin IS DISTINCT FROM false OR NEW.tier IS DISTINCT FROM 'basic' THEN
      RAISE EXCEPTION 'is_admin and tier cannot be set on profile creation';
    END IF;
    RETURN NEW;
  END IF;

  -- Authenticated non-admin callers may never set or change is_admin/tier.
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_admin IS DISTINCT FROM false OR NEW.tier IS DISTINCT FROM 'basic' THEN
      RAISE EXCEPTION 'is_admin and tier cannot be set on profile creation';
    END IF;
  ELSIF NEW.is_admin IS DISTINCT FROM OLD.is_admin OR NEW.tier IS DISTINCT FROM OLD.tier THEN
    RAISE EXCEPTION 'is_admin and tier can only be changed by an administrator';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_profile_privileges() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_profile_privileges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();