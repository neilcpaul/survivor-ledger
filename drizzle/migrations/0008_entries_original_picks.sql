ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS original_picks jsonb,
  ADD COLUMN IF NOT EXISTS original_locked_at timestamptz;