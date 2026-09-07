-- Internal sync job errors/timestamps should only be visible to admins.
DROP POLICY IF EXISTS "sync_state authenticated read" ON public.sync_state;

CREATE POLICY "sync_state admin read"
ON public.sync_state
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_admin
  )
);
