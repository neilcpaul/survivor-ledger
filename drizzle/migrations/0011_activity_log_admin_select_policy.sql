GRANT SELECT ON public.activity_log TO authenticated;

CREATE POLICY "activity_log admin read"
ON public.activity_log
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND p.is_admin
));