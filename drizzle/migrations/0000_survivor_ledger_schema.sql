-- Reference / cache tables (public read, service-role write)
CREATE TABLE public.teams (
  id text PRIMARY KEY,
  abbr text,
  name text,
  conference text,
  division text,
  logo_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.teams TO anon, authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams public read" ON public.teams FOR SELECT USING (true);

CREATE TABLE public.games (
  id text PRIMARY KEY,
  week int NOT NULL,
  season_type int NOT NULL DEFAULT 2,
  season_year int NOT NULL,
  home_team_id text REFERENCES public.teams(id),
  away_team_id text REFERENCES public.teams(id),
  kickoff_at timestamptz,
  venue_name text,
  venue_city text,
  venue_state text,
  venue_indoor bool,
  broadcast text,
  weather_condition text,
  weather_temp_f int,
  home_win_prob numeric,
  away_win_prob numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX games_week_idx ON public.games (season_year, season_type, week);
GRANT SELECT ON public.games TO anon, authenticated;
GRANT ALL ON public.games TO service_role;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "games public read" ON public.games FOR SELECT USING (true);

CREATE TABLE public.injuries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id text REFERENCES public.teams(id),
  athlete_id text,
  player_name text,
  position text,
  status text,
  detail text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, athlete_id)
);
CREATE INDEX injuries_team_idx ON public.injuries (team_id);
GRANT SELECT ON public.injuries TO anon, authenticated;
GRANT ALL ON public.injuries TO service_role;
ALTER TABLE public.injuries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "injuries public read" ON public.injuries FOR SELECT USING (true);

CREATE TABLE public.roster_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id text REFERENCES public.teams(id),
  athlete_id text,
  name text,
  position text,
  jersey_number text,
  headshot_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, athlete_id)
);
CREATE INDEX roster_team_idx ON public.roster_players (team_id);
GRANT SELECT ON public.roster_players TO anon, authenticated;
GRANT ALL ON public.roster_players TO service_role;
ALTER TABLE public.roster_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roster public read" ON public.roster_players FOR SELECT USING (true);

-- Sync bookkeeping
CREATE TABLE public.sync_state (
  id text PRIMARY KEY,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  running_since timestamptz
);
GRANT SELECT ON public.sync_state TO anon, authenticated;
GRANT ALL ON public.sync_state TO service_role;
ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_state public read" ON public.sync_state FOR SELECT USING (true);
INSERT INTO public.sync_state (id) VALUES ('espn');

-- User data
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TABLE public.entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entries_user_idx ON public.entries (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entries TO authenticated;
GRANT ALL ON public.entries TO service_role;
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own entries" ON public.entries FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  week int NOT NULL,
  team_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, week)
);
CREATE INDEX picks_entry_idx ON public.picks (entry_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.picks TO authenticated;
GRANT ALL ON public.picks TO service_role;
ALTER TABLE public.picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own picks" ON public.picks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = picks.entry_id AND e.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = picks.entry_id AND e.user_id = auth.uid()));

-- auto-create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
