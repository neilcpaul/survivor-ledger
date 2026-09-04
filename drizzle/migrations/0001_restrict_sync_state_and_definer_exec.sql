-- Restrict internal sync status to signed-in users only
DROP POLICY IF EXISTS "sync_state public read" ON public.sync_state;

REVOKE SELECT ON public.sync_state FROM anon;
GRANT SELECT ON public.sync_state TO authenticated;
GRANT ALL ON public.sync_state TO service_role;

CREATE POLICY "sync_state authenticated read"
ON public.sync_state
FOR SELECT
TO authenticated
USING (true);

-- SECURITY DEFINER trigger function must not be callable via the API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
