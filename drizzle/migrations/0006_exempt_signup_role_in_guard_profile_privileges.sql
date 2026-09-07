CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service-role backend (admin tooling) and the internal signup role
  -- (handle_new_user trigger on auth.users) may set privileges.
  IF auth.role() = 'service_role' OR session_user = 'supabase_auth_admin' THEN
    RETURN NEW;
  END IF;

  -- Any other unauthenticated path may only create rows with safe defaults.
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