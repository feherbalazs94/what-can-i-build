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

-- ─── user_roles (table + RLS enable only — policies come after is_admin()) ──────
-- Fix #1: defined here so is_admin() can reference it at parse time
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role       TEXT NOT NULL CHECK (role IN ('admin')),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ─── Helper: is current user an admin? ────────────────────────────────────────
-- SECURITY DEFINER so it bypasses RLS when called from policies (avoids recursion)
-- Fix #2 (partial): pin search_path on SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- ─── circuits ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.circuits (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  key            TEXT        UNIQUE NOT NULL,
  name           TEXT        NOT NULL,
  author         TEXT,
  url_schematic  TEXT,
  url_stripboard TEXT,
  url_perfboard  TEXT,
  url_pcb        TEXT,
  url_tagboard   TEXT,
  url_pedal      TEXT,
  url_demo       TEXT,
  parts          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  vote_score     INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_circuits_status ON public.circuits (status);
CREATE INDEX IF NOT EXISTS idx_circuits_key    ON public.circuits (key);

ALTER TABLE public.circuits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select circuits"
  ON public.circuits FOR SELECT
  USING (status = 'approved' OR public.is_admin());

CREATE POLICY "insert pending circuit"
  ON public.circuits FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND status = 'pending' AND submitted_by = auth.uid());

-- Fix #3: added WITH CHECK to admin UPDATE policy
CREATE POLICY "admin update circuit"
  ON public.circuits FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin delete circuit"
  ON public.circuits FOR DELETE
  USING (public.is_admin());

CREATE TRIGGER trg_circuits_updated_at
  BEFORE UPDATE ON public.circuits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── votes ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.votes (
  id          UUID     DEFAULT gen_random_uuid() PRIMARY KEY,
  circuit_id  UUID     REFERENCES public.circuits(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID     REFERENCES auth.users(id)      ON DELETE CASCADE NOT NULL,
  value       SMALLINT NOT NULL CHECK (value IN (1, -1)),
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (circuit_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_circuit ON public.votes (circuit_id);

ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select votes"    ON public.votes FOR SELECT USING (true);
CREATE POLICY "insert own vote" ON public.votes FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Fix #4: added WITH CHECK to votes UPDATE policy
CREATE POLICY "update own vote" ON public.votes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own vote" ON public.votes FOR DELETE USING (auth.uid() = user_id);

-- ─── vote_score trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_circuit_vote_score()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.circuits SET vote_score = vote_score - OLD.value WHERE id = OLD.circuit_id;
  ELSIF TG_OP = 'INSERT' THEN
    UPDATE public.circuits SET vote_score = vote_score + NEW.value WHERE id = NEW.circuit_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.circuits SET vote_score = vote_score - OLD.value + NEW.value WHERE id = NEW.circuit_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_votes_update_score
  AFTER INSERT OR UPDATE OR DELETE ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.update_circuit_vote_score();

-- ─── comments ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  circuit_id  UUID REFERENCES public.circuits(id)  ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users(id)        ON DELETE CASCADE NOT NULL,
  parent_id   UUID REFERENCES public.comments(id)   ON DELETE CASCADE,
  body        TEXT NOT NULL,
  vote_score  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_circuit ON public.comments (circuit_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent  ON public.comments (parent_id);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select comments"    ON public.comments FOR SELECT USING (true);
CREATE POLICY "insert own comment" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Fix #5: added WITH CHECK to comments UPDATE policy
CREATE POLICY "update own comment" ON public.comments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own comment" ON public.comments FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── comment upvote RPC ───────────────────────────────────────────────────────
-- Fix #2: added auth guard + pinned search_path
CREATE OR REPLACE FUNCTION public.increment_comment_vote(comment_id UUID)
RETURNS void AS $$
  UPDATE public.comments
  SET vote_score = vote_score + 1
  WHERE id = comment_id
    AND auth.uid() IS NOT NULL;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp;

-- ─── user_roles policies (must come after is_admin()) ─────────────────────────
-- Fix #1: policies moved here so is_admin() is already defined
CREATE POLICY "select own role or admin"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- Fix #6: added WITH CHECK to user_roles FOR ALL policy
CREATE POLICY "admin manage roles"
  ON public.user_roles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
