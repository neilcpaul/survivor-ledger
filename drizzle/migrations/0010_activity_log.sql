CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL CHECK (actor_type IN ('user','admin','system')),
  actor_id uuid,
  event_type text NOT NULL,
  target_user_id uuid,
  target_entry_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.activity_log TO service_role;

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX activity_log_created_at_idx ON public.activity_log (created_at DESC);
CREATE INDEX activity_log_target_user_idx ON public.activity_log (target_user_id);

-- New signups: one row the moment the profile is first created.
CREATE OR REPLACE FUNCTION public.log_profile_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity_log (actor_type, actor_id, event_type, target_user_id, detail)
  VALUES ('user', NEW.id, 'signup', NEW.id, jsonb_build_object('display_name', NEW.display_name));
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_profile_signup() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER log_profile_signup
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.log_profile_signup();

-- Sign-in events live in auth.audit_log_entries; expose a read for the
-- service-role admin backend only, never to app roles.
CREATE OR REPLACE FUNCTION public.admin_recent_logins(_limit integer DEFAULT 200)
RETURNS TABLE (id uuid, user_id uuid, created_at timestamptz, action text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id,
         NULLIF(a.payload->>'actor_id','')::uuid AS user_id,
         a.created_at,
         a.payload->>'action' AS action
  FROM auth.audit_log_entries a
  WHERE a.payload->>'action' IN ('login','token_refreshed','logout')
    AND a.payload->>'action' = 'login'
  ORDER BY a.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 1000)
$$;

REVOKE ALL ON FUNCTION public.admin_recent_logins(integer) FROM PUBLIC, anon, authenticated;