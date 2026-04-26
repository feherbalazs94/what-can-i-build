-- What Can I Build — Supabase schema
-- Run this in: Supabase Dashboard → SQL Editor → New query

-- Parts inventory per user
CREATE TABLE IF NOT EXISTS public.user_parts (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  counts      JSONB       DEFAULT '{}'::jsonb NOT NULL,
  done        JSONB       DEFAULT '{}'::jsonb NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Row-level security: users can only touch their own row
ALTER TABLE public.user_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own"  ON public.user_parts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own"  ON public.user_parts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own"  ON public.user_parts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own"  ON public.user_parts FOR DELETE USING (auth.uid() = user_id);

-- Auto-update updated_at on every write
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_parts_updated_at
  BEFORE UPDATE ON public.user_parts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
