-- Prevent privilege escalation: authenticated users may only update their display_name.
-- The guard_profile_privileges BEFORE INSERT OR UPDATE trigger already enforces this logically;
-- this adds a grant-level enforcement so is_admin/tier cannot be updated even if the trigger is bypassed.

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;