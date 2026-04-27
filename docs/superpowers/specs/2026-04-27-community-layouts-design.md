# Design: Community Layouts — Submissions, Voting, Comments

**Date:** 2026-04-27  
**Status:** Approved

---

## Summary

Add a community layer to the app: users submit new guitar pedal circuit layouts, admins moderate them via a queue, and all circuits (existing + community) support Reddit-style upvote/downvote voting and threaded comments. All existing circuits migrate from `circuits.js` into Supabase as the single source of truth.

---

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Architecture | Full DB migration (Option A) | Single source of truth; user explicitly chose this |
| Circuit data source | Supabase `circuits` table | `circuits.js` retired after seed migration |
| Vote aggregation | Denormalized `vote_score` on `circuits`, trigger-maintained | Avoids per-page-load aggregation queries |
| Parts entry (submission form) | Both modes — row-by-row (default) + paste JSON (tab) | Foolproof for newcomers, fast for power users |
| Comments placement | Centered modal | More width for discussion |
| Comment threading | Adjacency list (`parent_id` self-reference) | Sufficient depth for this community; simpler than closure table |
| Moderation | `admin.html` page, visible in topbar for admin users only | Separate page avoids cluttering the main UI |
| Admin role assignment | `user_roles` table; first admin seeded via SQL; subsequent admins managed in-UI via "Manage Admins" tab | No direct DB access needed after initial setup |
| Voting on comments | Upvote only (↑ score shown inline) | Downvoting comments adds friction; keep it lightweight |

---

## Database Schema

### New tables

```sql
-- All circuits (existing + community-submitted)
CREATE TABLE public.circuits (
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

CREATE INDEX idx_circuits_status ON public.circuits (status);
CREATE INDEX idx_circuits_key    ON public.circuits (key);

-- Upvote / downvote per user per circuit (one vote per user enforced)
CREATE TABLE public.votes (
  id          UUID      DEFAULT gen_random_uuid() PRIMARY KEY,
  circuit_id  UUID      REFERENCES public.circuits(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID      REFERENCES auth.users(id)      ON DELETE CASCADE NOT NULL,
  value       SMALLINT  NOT NULL CHECK (value IN (1, -1)),
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (circuit_id, user_id)
);

CREATE INDEX idx_votes_circuit ON public.votes (circuit_id);

-- Threaded comments (adjacency list; parent_id NULL = top-level)
CREATE TABLE public.comments (
  id          UUID      DEFAULT gen_random_uuid() PRIMARY KEY,
  circuit_id  UUID      REFERENCES public.circuits(id)  ON DELETE CASCADE NOT NULL,
  user_id     UUID      REFERENCES auth.users(id)       ON DELETE CASCADE NOT NULL,
  parent_id   UUID      REFERENCES public.comments(id)  ON DELETE CASCADE,
  body        TEXT      NOT NULL,
  vote_score  INTEGER   NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_comments_circuit ON public.comments (circuit_id);
CREATE INDEX idx_comments_parent  ON public.comments (parent_id);

-- Admin role assignments
CREATE TABLE public.user_roles (
  user_id     UUID  REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role        TEXT  NOT NULL CHECK (role IN ('admin')),
  granted_by  UUID  REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

### Trigger — maintain `circuits.vote_score`

```sql
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
```

### Row-level security

| Table | Policy |
|---|---|
| `circuits` | Anyone can SELECT `status = 'approved'`. Authenticated users can INSERT with `status = 'pending'`. Only admins (via `user_roles`) can UPDATE `status`. |
| `votes` | Anyone can SELECT. Authenticated users can INSERT/UPDATE/DELETE their own row. |
| `comments` | Anyone can SELECT. Authenticated users can INSERT. Owners can UPDATE/DELETE their own row. |
| `user_roles` | Admins can SELECT all, INSERT, DELETE. Non-admins can SELECT only their own row. |

### Seed migration

A one-time Node script (`scripts/seed_circuits.js`) reads all entries from `circuit/circuits.js` into Supabase. Because `circuits.js` uses a browser global assignment (`window.SC.circuit = {}`), the seed script reads the file as text, strips the assignment wrapper with a regex, then `JSON.parse()`s the resulting object literal. Each entry is inserted into `public.circuits` with `status = 'approved'` and `submitted_by = NULL`. After successful seed, `circuits.js` is retired (kept as archive, not loaded by `index.html`).

---

## Files Changed / Added

### Modified

| File | Change |
|---|---|
| `index.html` | Remove `<script src="circuit/circuits.js">`. Add `<script src="js/community.js">`, `<script src="js/vote.js">`, `<script src="js/comments.js">`, `<script src="js/submit.js">`. Add `+ Submit layout` button to topbar. Add `admin.html` link to topbar (admin-only, shown after auth check). Add Vote and Comments columns to both `table_ok` and `table_almost`. |
| `js/index.js` | Replace `SC.circuit` (from circuits.js) with circuits fetched from Supabase. Load approved circuits on init; merge community badge for `submitted_by != null`. |
| `js/render.js` | Add Vote column (▲/▼ buttons + score) and Comments column (💬 count button) to `SC.renderOne()` and `SC.renderAlmost()`. Community circuits get a purple `community` badge. |
| `supabase_schema.sql` | Append all new table definitions, indexes, trigger, and RLS policies. |
| `css/index.css` | Add `.community-badge`, `.vote-col`, `.vote-btn`, `.vote-score`, `.comment-btn` styles. |

### New files

| File | Purpose |
|---|---|
| `js/community.js` | Fetches approved circuits from Supabase on page load; exposes `SC.loadCircuits()` replacing circuits.js init. |
| `js/vote.js` | Handles upvote/downvote: optimistic UI update, upsert to `votes`, rollback on error. |
| `js/submit.js` | Submission form modal: row-by-row entry (default tab) + paste JSON (second tab), validation, insert to `circuits` with `status = 'pending'`. |
| `js/comments.js` | Comments modal: fetches top-level + nested replies for a circuit, renders threaded tree, post/reply form, inline comment upvote. |
| `js/admin.js` | Moderation panel logic: fetch pending queue, approve/reject actions, manage admins tab. |
| `admin.html` | Moderation panel page. Tabs: Pending / Approved / Rejected / Manage Admins. Only accessible to admin users (redirects to `index.html` if not admin). |
| `css/community.css` | All styles for submission modal, comments modal, moderation panel. |
| `scripts/seed_circuits.js` | One-time Node script: reads circuits.js, bulk-inserts into Supabase with `status = 'approved'`. |

---

## Feature Breakdown

### 1. Circuit loading from Supabase (`community.js`)

- On page init: `SELECT * FROM circuits WHERE status = 'approved'`
- Results populate `SC.circuit` (same shape as old circuits.js object) so existing `filter.js` / `render.js` logic needs minimal changes
- Circuits with `submitted_by != null` are flagged as community-submitted for badge rendering

### 2. Submission form (`submit.js`)

- Triggered by `+ Submit layout` button in topbar (requires sign-in; prompts auth modal if not signed in)
- Modal fields: Circuit name (required), Author, six URL fields (schematic / stripboard / perfboard / pcb / tagboard / demo), Parts list
- Parts list has two tabs:
  - **Row-by-row** (default): dynamic table of Designator + Value rows, `+ Add component` button, `×` to remove rows
  - **Paste JSON**: textarea accepting `{"C1": "100n", ...}` format; validated as valid JSON on submit
- On submit: validates required fields, inserts into `circuits` with `status = 'pending'`, shows success message
- Submitted circuits are not visible to the submitter until approved

### 3. Voting (`vote.js`)

- ▲/▼ buttons on every circuit row (requires sign-in to interact)
- Optimistic UI: score updates immediately, reverts if Supabase call fails
- Clicking the active vote direction again removes the vote (`DELETE FROM votes`)
- Clicking the opposite direction flips the vote (`UPDATE votes SET value = ...`)
- `vote_score` displayed between the buttons; coloured green (positive), red (negative), muted (zero)
- Unauthenticated users see the score but buttons are disabled with a tooltip "Sign in to vote"

### 4. Comments modal (`comments.js`)

- Opens on 💬 click; shows circuit name in header and comment count
- **Fetching**: `SELECT * FROM comments WHERE circuit_id = ? ORDER BY created_at ASC` — full list fetched, threaded client-side by building a parent→children map
- **Rendering**: top-level comments rendered first; replies indented under their parent with a left border accent; max visual depth shown: 3 levels (deeper replies collapse into "show more")
- **Inline comment voting**: upvote only (↑ score). Calls a Supabase RPC `increment_comment_vote(comment_id)` that does `UPDATE comments SET vote_score = vote_score + 1 WHERE id = comment_id`. No separate votes table for comments — `vote_score` column on `comments` is sufficient; duplicate prevention handled server-side in the RPC function.
- **Posting**: textarea + Post button at bottom; authenticated only. Clicking ↩ Reply on a comment focuses the post box and sets `parent_id`
- **Timestamps**: shown as relative ("2 days ago")
- **Auth gate**: post form is hidden for unauthenticated users; replaced with "Sign in to join the discussion"

### 5. Moderation panel (`admin.html` + `admin.js`)

- Topbar link "⚙ Admin" visible only when `user_roles` contains the current user with `role = 'admin'`
- Page redirects to `index.html` if current user is not admin (checked on load)
- **Pending tab**: list of submissions with circuit name, submitter email, timestamp, part count, link pills, parts chip preview. Actions: Approve (sets `status = 'approved'`), Reject (prompts optional rejection reason, sets `status = 'rejected'`), Preview (opens the circuit in a read-only modal showing how it will look in the main table)
- **Approved tab**: searchable list of all approved circuits; admin can Reject (unpublish) any
- **Rejected tab**: list with option to Approve (re-publish) or permanently delete
- **Manage Admins tab**: shows current admins (email + granted date). Input to grant admin by email (looks up `auth.users` by email, inserts into `user_roles`). Revoke button per admin (cannot revoke yourself)
- First admin seeded via: `INSERT INTO public.user_roles (user_id, role) VALUES ('<uuid>', 'admin');`

---

## What's Out of Scope

- Editing submitted circuits after submission (submitter cannot edit; admin can reject and ask for resubmission)
- Notifications (email/in-app) when submission is approved/rejected
- Search within comments
- Pagination of comments (fetch all for a circuit; acceptable at this scale)
- Sorting circuits by vote score (a future filter option)
- Downvoting comments
