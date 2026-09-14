ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS home_score integer,
  ADD COLUMN IF NOT EXISTS away_score integer,
  ADD COLUMN IF NOT EXISTS winner_team_id text,
  ADD COLUMN IF NOT EXISTS status_state text,
  ADD COLUMN IF NOT EXISTS status_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_detail text,
  ADD COLUMN IF NOT EXISTS period integer,
  ADD COLUMN IF NOT EXISTS display_clock text,
  ADD COLUMN IF NOT EXISTS home_linescores jsonb,
  ADD COLUMN IF NOT EXISTS away_linescores jsonb,
  ADD COLUMN IF NOT EXISTS live_home_win_prob numeric,
  ADD COLUMN IF NOT EXISTS live_away_win_prob numeric,
  ADD COLUMN IF NOT EXISTS situation jsonb;

CREATE TABLE IF NOT EXISTS public.season_state (
  id text PRIMARY KEY DEFAULT 'nfl',
  current_week integer NOT NULL DEFAULT 1,
  season_type integer NOT NULL DEFAULT 2,
  season_year integer,
  last_synced_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.season_state TO anon;
GRANT SELECT ON public.season_state TO authenticated;
GRANT ALL ON public.season_state TO service_role;

ALTER TABLE public.season_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "season state public read" ON public.season_state;
CREATE POLICY "season state public read" ON public.season_state
  FOR SELECT TO public USING (true);

INSERT INTO public.season_state (id, current_week, season_type)
VALUES ('nfl', 1, 2)
ON CONFLICT (id) DO NOTHING;