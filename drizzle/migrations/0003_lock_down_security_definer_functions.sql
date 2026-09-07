-- Admin reads of every profile happen only through server-side service-role code,
-- so the RLS policy that called the SECURITY DEFINER helper is no longer needed.
DROP POLICY IF EXISTS "admins read all profiles" ON public.profiles;

-- No client role may call the SECURITY DEFINER helpers directly.
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_privileges() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
