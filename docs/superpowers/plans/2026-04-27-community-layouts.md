# Community Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add community circuit submissions (with moderation), Reddit-style upvote/downvote voting, and threaded comments — migrating the circuit database from `circuits.js` to Supabase as the single source of truth.

**Architecture:** All existing circuits are seeded into a new Supabase `circuits` table (status=`approved`). Community users submit new circuits (status=`pending`) which admins approve/reject via `admin.html`. All circuits support upvote/downvote (one per user, trigger-maintained score) and threaded comments opened via a centered modal.

**Tech Stack:** Vanilla JS (no framework, no build step), Supabase JS SDK v2 (already loaded via CDN), plain SQL for schema + RLS.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase_schema.sql` | Modify | Append new tables, trigger, RLS, helper function |
| `scripts/seed_circuits.js` | Create | One-time Node script: reads `circuit/*.json`, bulk-inserts into Supabase |
| `js/community.js` | Create | `SC.loadCircuits()` — fetches approved circuits from Supabase, populates `SC.circuit` |
| `js/vote.js` | Create | `SC.vote.*` — cast/retract votes with optimistic UI |
| `js/submit.js` | Create | `SC.submit.*` — submission form modal (two-tab parts entry) |
| `js/comments.js` | Create | `SC.comments.*` — threaded comments modal |
| `js/admin.js` | Create | `SC.admin.*` — moderation queue, approve/reject, manage admins |
| `js/render.js` | Modify | Add Vote column, Comments button, community badge, demo link |
| `js/index.js` | Modify | Boot: call async `SC.loadCircuits()` before `SC.showParts()` / `SC.refresh()` |
| `index.html` | Modify | Remove circuits.js script tag; add new scripts; add Submit button, Vote/Comments table columns, submission modal HTML, comments modal HTML |
| `admin.html` | Create | Moderation panel page (tabs: Pending / Approved / Rejected / Manage Admins) |
| `css/community.css` | Create | All styles for vote buttons, community badge, submission modal, comments modal, admin panel |
| `css/index.css` | Modify | Add `?version=276` cache-bust to all stylesheet links |

---

## Task 1: Database Schema

**Files:**
- Modify: `supabase_schema.sql`

- [ ] **Step 1: Append new schema to `supabase_schema.sql`**

Add everything below the existing content of `supabase_schema.sql`:

```sql
-- ─── Helper: is current user an admin? ────────────────────────────────────────
-- SECURITY DEFINER so it bypasses RLS when called from policies (avoids recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

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

CREATE POLICY "admin update circuit"
  ON public.circuits FOR UPDATE
  USING (public.is_admin());

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

CREATE POLICY "select votes"   ON public.votes FOR SELECT USING (true);
CREATE POLICY "insert own vote" ON public.votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own vote" ON public.votes FOR UPDATE USING (auth.uid() = user_id);
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

CREATE POLICY "select comments"   ON public.comments FOR SELECT USING (true);
CREATE POLICY "insert own comment" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own comment" ON public.comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own comment" ON public.comments FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── comment upvote RPC ───────────────────────────────────────────────────────
-- Prevents double-voting via session-scoped idempotency (client tracks in localStorage)
CREATE OR REPLACE FUNCTION public.increment_comment_vote(comment_id UUID)
RETURNS void AS $$
  UPDATE public.comments SET vote_score = vote_score + 1 WHERE id = comment_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- ─── user_roles ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role       TEXT NOT NULL CHECK (role IN ('admin')),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own role or admin"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "admin manage roles"
  ON public.user_roles FOR ALL
  USING (public.is_admin());
```

- [ ] **Step 2: Apply schema in Supabase**

Open Supabase Dashboard → SQL Editor → New query.  
Paste the full new block you just wrote and run it.  
Expected: all statements succeed with no errors.

- [ ] **Step 3: Verify tables exist**

In the Supabase Dashboard → Table Editor, confirm these tables are visible:
`circuits`, `votes`, `comments`, `user_roles`

Also run in SQL Editor:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```
Expected output includes: `circuits`, `comments`, `user_roles`, `user_parts`, `votes`

- [ ] **Step 4: Seed the first admin**

In SQL Editor, find your user's UUID first:
```sql
SELECT id, email FROM auth.users WHERE email = 'your@email.com';
```
Then insert the admin role (replace the UUID):
```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<your-uuid-here>', 'admin');
```

- [ ] **Step 5: Commit**

```bash
git add supabase_schema.sql
git commit -m "feat: add circuits, votes, comments, user_roles schema"
```

---

## Task 2: Seed Existing Circuits

**Files:**
- Create: `scripts/seed_circuits.js`

- [ ] **Step 1: Create the seed script**

Create file `scripts/seed_circuits.js`:

```js
#!/usr/bin/env node
// One-time seed: reads all circuit/*.json files, inserts into Supabase circuits table
// Run: node scripts/seed_circuits.js
// Requires: npm install @supabase/supabase-js (run once in scripts/ or project root)

'use strict';

var fs = require('fs');
var path = require('path');
var supabaseJs = require('@supabase/supabase-js');

var SUPABASE_URL = 'https://jtahecdiwbqoqahogxzt.supabase.co';
// Use service_role key (not anon key) to bypass RLS for the seed insert.
// Find it in Supabase Dashboard → Settings → API → service_role key.
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
    console.error('Set SUPABASE_SERVICE_KEY env var to the service_role key');
    process.exit(1);
}

var client = supabaseJs.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

var circuitDir = path.join(__dirname, '..', 'circuit');
var files = fs.readdirSync(circuitDir).filter(function (f) {
    return f.endsWith('.json');
});

var rows = files.map(function (filename) {
    var key = filename.replace('.json', '');
    var data = JSON.parse(fs.readFileSync(path.join(circuitDir, filename), 'utf8'));
    var url = data.url || {};
    return {
        key: key,
        name: data.name,
        author: data.author || null,
        url_schematic:  url.schematic  || null,
        url_stripboard: url.stripboard || null,
        url_perfboard:  url.perfboard  || null,
        url_pcb:        url.pcb        || null,
        url_tagboard:   url.tagboard   || null,
        url_pedal:      url.pedal      || null,
        url_demo:       null,
        parts:          data.parts || {},
        status:         'approved',
        submitted_by:   null
    };
});

console.log('Seeding', rows.length, 'circuits...');

// Insert in batches of 100 to avoid request size limits
var BATCH = 100;
var promises = [];
for (var i = 0; i < rows.length; i += BATCH) {
    promises.push(
        client.from('circuits').upsert(rows.slice(i, i + BATCH), { onConflict: 'key' })
    );
}

Promise.all(promises).then(function (results) {
    var errors = results.filter(function (r) { return r.error; });
    if (errors.length > 0) {
        console.error('Errors:', errors.map(function (r) { return r.error.message; }));
        process.exit(1);
    }
    console.log('Done — seeded', rows.length, 'circuits.');
}).catch(function (err) {
    console.error('Fatal:', err.message);
    process.exit(1);
});
```

- [ ] **Step 2: Install Supabase JS for Node and run**

```bash
cd "/Users/macbook/what can i build/.claude/worktrees/strange-northcutt-7a19dc"
npm install @supabase/supabase-js
SUPABASE_SERVICE_KEY=<paste-service-role-key> node scripts/seed_circuits.js
```

Expected output:
```
Seeding 493 circuits...
Done — seeded 493 circuits.
```
(Count will match number of .json files in circuit/)

- [ ] **Step 3: Verify in Supabase**

In SQL Editor:
```sql
SELECT COUNT(*) FROM public.circuits WHERE status = 'approved';
```
Expected: same count as your .json files.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed_circuits.js package.json package-lock.json
git commit -m "feat: seed script — migrate circuits.js to Supabase"
```

---

## Task 3: Circuit Loading from Supabase

**Files:**
- Create: `js/community.js`

- [ ] **Step 1: Create `js/community.js`**

```js
// Load approved circuits from Supabase, replacing the old circuits.js global
"use strict";
// globals: supabase, SUPABASE_URL, SUPABASE_ANON_KEY

var SC = window.SC || {};

SC.loadCircuits = function () {
    // Returns a Promise that resolves when SC.circuit is populated.
    // Uses a fresh anon client so this can be called before auth.init().
    var client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    SC.circuit = SC.circuit || {};

    return client
        .from('circuits')
        .select('id, key, name, author, url_schematic, url_stripboard, url_perfboard, url_pcb, url_tagboard, url_pedal, url_demo, parts, status, submitted_by, vote_score')
        .eq('status', 'approved')
        .then(function (result) {
            if (result.error) {
                console.error('loadCircuits error:', result.error.message);
                return;
            }
            SC.circuit = {};
            (result.data || []).forEach(function (row) {
                SC.circuit[row.key] = {
                    id:           row.id,
                    key:          row.key,
                    name:         row.name,
                    author:       row.author || '',
                    submitted_by: row.submitted_by,
                    vote_score:   row.vote_score || 0,
                    url: {
                        schematic:  row.url_schematic  || '',
                        stripboard: row.url_stripboard || '',
                        perfboard:  row.url_perfboard  || '',
                        pcb:        row.url_pcb        || '',
                        tagboard:   row.url_tagboard   || '',
                        pedal:      row.url_pedal      || '',
                        demo:       row.url_demo       || ''
                    },
                    parts: row.parts || {}
                };
            });
        });
};
```

- [ ] **Step 2: Verify shape matches what filter.js expects**

`filter.js` accesses `c.parts`, `c.key` (set by filter itself), and no other top-level fields.  
`render.js` accesses `aCircuit.name`, `aCircuit.author`, `aCircuit.url`, `aCircuit.parts`.  
The shape above satisfies all of these. ✓

- [ ] **Step 3: Commit**

```bash
git add js/community.js
git commit -m "feat: community.js — load circuits from Supabase"
```

---

## Task 4: Wire Async Boot in `index.js` and `index.html`

**Files:**
- Modify: `js/index.js`
- Modify: `index.html`

- [ ] **Step 1: Add loading state to `index.html`**

In `index.html`, find the `<main>` opening tag and add a loading indicator right after it:

```html
    <!-- ══ Main content ═══════════════════════════════════════════════ -->
    <main>

        <div id="circuits-loading" style="padding: 2rem; color: #475569; font-size: 13px;">
          Loading circuits…
        </div>
```

- [ ] **Step 2: Remove `circuits.js` script tag and add new scripts**

In `index.html`, remove this line:
```html
    <script type="text/javascript" src="circuit/circuits.js?version=275"></script>
```

After the existing script tags (before `</head>`), add:
```html
    <link rel="stylesheet" href="css/community.css?version=276" type="text/css" />

    <script type="text/javascript" src="js/community.js?version=276"></script>
    <script type="text/javascript" src="js/vote.js?version=276"></script>
    <script type="text/javascript" src="js/submit.js?version=276"></script>
    <script type="text/javascript" src="js/comments.js?version=276"></script>
```

Also bump `?version=275` to `?version=276` on all existing stylesheet and script tags so browsers re-fetch them.

- [ ] **Step 3: Update boot sequence in `js/index.js`**

Find the `window.addEventListener('DOMContentLoaded', function () {` block.  
Replace the line:
```js
    // Populate sidebar inputs and run first filter pass
    SC.showParts();
    SC.refresh();
    SC.updateSidebarCounts();
    SC.checkNewCircuits();
    SC.deepLink.resolve();
```

With:
```js
    // Load circuits async from Supabase, then boot the UI
    SC.loadCircuits().then(function () {
        var loader = document.getElementById('circuits-loading');
        if (loader) { loader.style.display = 'none'; }
        SC.showParts();
        SC.refresh();
        SC.updateSidebarCounts();
        SC.checkNewCircuits();
        SC.deepLink.resolve();
    });
```

- [ ] **Step 4: Verify in browser**

Open `index.html` in a local server (e.g. `python3 -m http.server 8080`).  
Open browser console.  
Expected:
- Brief "Loading circuits…" text appears in main area
- Disappears once circuits load from Supabase
- Tables populate with circuits as before
- No console errors

- [ ] **Step 5: Commit**

```bash
git add index.html js/index.js
git commit -m "feat: load circuits from Supabase on boot (retire circuits.js)"
```

---

## Task 5: Render Updates — Vote Column, Comments Button, Community Badge

**Files:**
- Modify: `js/render.js`

- [ ] **Step 1: Add `demo` to URL_LABELS**

Find in `js/render.js`:
```js
SC.URL_LABELS = {
    schematic: 'sch',
    stripboard: 'strip',
    perfboard: 'perf',
    pcb: 'pcb',
    tagboard: 'tag',
    pedal: 'pedal'
};
```
Replace with:
```js
SC.URL_LABELS = {
    schematic: 'sch',
    stripboard: 'strip',
    perfboard: 'perf',
    pcb: 'pcb',
    tagboard: 'tag',
    pedal: 'pedal',
    demo: '🎵 demo'
};
```

- [ ] **Step 2: Add vote column helper**

Add this function before `SC.renderOne`:

```js
SC.renderVoteCol = function (aCircuit) {
    // Returns a <td> with ▲ score ▼ vote buttons
    var td, wrap, btnUp, score, btnDown;
    td = document.createElement('td');
    wrap = document.createElement('div');
    wrap.className = 'vote-col';

    btnUp = document.createElement('button');
    btnUp.className = 'vote-btn up';
    btnUp.textContent = '▲';
    btnUp.title = 'Upvote';
    btnUp.dataset.circuitId = aCircuit.id;
    btnUp.dataset.value = '1';

    score = document.createElement('span');
    score.className = 'vote-score' + (aCircuit.vote_score > 0 ? ' positive' : aCircuit.vote_score < 0 ? ' negative' : '');
    score.textContent = aCircuit.vote_score || 0;
    score.dataset.circuitId = aCircuit.id;

    btnDown = document.createElement('button');
    btnDown.className = 'vote-btn down';
    btnDown.textContent = '▼';
    btnDown.title = 'Downvote';
    btnDown.dataset.circuitId = aCircuit.id;
    btnDown.dataset.value = '-1';

    btnUp.onclick   = function () { SC.vote.cast(aCircuit.id,  1, score, btnUp, btnDown); };
    btnDown.onclick = function () { SC.vote.cast(aCircuit.id, -1, score, btnUp, btnDown); };

    wrap.appendChild(btnUp);
    wrap.appendChild(score);
    wrap.appendChild(btnDown);
    td.appendChild(wrap);
    return td;
};
```

- [ ] **Step 3: Add comments button helper**

Add right after `SC.renderVoteCol`:

```js
SC.renderCommentsBtn = function (aKey, aCircuit) {
    // Returns a <td> with a 💬 N comments button
    var td, btn;
    td = document.createElement('td');
    btn = document.createElement('button');
    btn.className = 'comment-btn';
    btn.innerHTML = '💬 <span class="comment-count" id="ccount_' + aKey + '">…</span>';
    btn.onclick = function () { SC.comments.open(aCircuit.id, aCircuit.name, aKey); };
    td.appendChild(btn);
    return td;
};
```

- [ ] **Step 4: Update `SC.renderOne` to add Vote + Comments columns and community badge**

Find the section in `SC.renderOne` that builds the name + author `<td>`:
```js
    b = document.createElement('b');
    b.className = 'circuit-name';
    b.textContent = aCircuit.name;
    td.appendChild(b);
```

Replace with:
```js
    b = document.createElement('b');
    b.className = 'circuit-name';
    b.textContent = aCircuit.name;
    if (aCircuit.submitted_by) {
        var badge = document.createElement('span');
        badge.className = 'community-badge';
        badge.textContent = 'community';
        b.appendChild(badge);
    }
    td.appendChild(b);
```

Then find the very end of `SC.renderOne`, right before `return tr;`:
```js
    tr.appendChild(td);
    return tr;
```

Replace with:
```js
    tr.appendChild(td);
    tr.appendChild(SC.renderVoteCol(aCircuit));
    tr.appendChild(SC.renderCommentsBtn(aKey, aCircuit));
    return tr;
};
```

- [ ] **Step 5: Apply the same changes to `SC.renderAlmost`**

In `SC.renderAlmost`, find the community badge and vote/comments column injection points — they are identical to `SC.renderOne`. Apply the same two changes:

1. Add the community badge span after setting `b.textContent = aCircuit.name`:
```js
    if (aCircuit.submitted_by) {
        var badge = document.createElement('span');
        badge.className = 'community-badge';
        badge.textContent = 'community';
        b.appendChild(badge);
    }
```

2. Before `return tr;`, append vote and comments columns:
```js
    tr.appendChild(SC.renderVoteCol(aCircuit));
    tr.appendChild(SC.renderCommentsBtn(aKey, aCircuit));
    return tr;
};
```

- [ ] **Step 6: Add Vote and Comments column headers to both tables in `index.html`**

Find the first table's `<thead>`:
```html
                <tr>
                    <th class="sticky">Links</th>
                    <th class="sticky" style="width: 100%">Circuit</th>
                    <th class="sticky" style="min-width: 8ex;">Parts</th>
                    <th class="sticky">Action</th>
                </tr>
```

Replace with:
```html
                <tr>
                    <th class="sticky">Links</th>
                    <th class="sticky" style="width: 100%">Circuit</th>
                    <th class="sticky" style="min-width: 8ex;">Parts</th>
                    <th class="sticky" style="text-align:center">Vote</th>
                    <th class="sticky">Comments</th>
                    <th class="sticky">Action</th>
                </tr>
```

Apply the same change to the second table's `<thead>` (the "almost" table, which has no `class="sticky"` on its `<th>` elements).

- [ ] **Step 7: Verify in browser**

Reload the page. Each circuit row now shows ▲/▼ buttons with score and a 💬 button.  
Community circuits (submitted_by != null) show a purple "community" badge.  
Demo links show as "🎵 demo" pills for circuits that have `url_demo`.  
No console errors.

- [ ] **Step 8: Commit**

```bash
git add js/render.js index.html
git commit -m "feat: add vote column, comments button, community badge to circuit rows"
```

---

## Task 6: CSS for Community Features

**Files:**
- Create: `css/community.css`

- [ ] **Step 1: Create `css/community.css`**

```css
/* ── Community badge ────────────────────────────────────────────────────────── */
.community-badge {
  display: inline-block;
  margin-left: 7px;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: #1e1b4b;
  color: #818cf8;
  border: 1px solid #3730a3;
  border-radius: 99px;
  padding: 1px 7px;
  vertical-align: middle;
}

/* ── Vote column ────────────────────────────────────────────────────────────── */
.vote-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 44px;
}

.vote-btn {
  background: none;
  border: 1px solid #1e2d3d;
  color: #475569;
  width: 28px;
  height: 26px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
  line-height: 1;
}

.vote-btn.up:hover,
.vote-btn.up.active  { border-color: #4ade80; color: #4ade80; background: rgba(74,222,128,0.08); }

.vote-btn.down:hover,
.vote-btn.down.active { border-color: #f87171; color: #f87171; background: rgba(248,113,113,0.08); }

.vote-btn:disabled { opacity: 0.35; cursor: default; }

.vote-score           { font-size: 12px; font-weight: 700; color: #e2e8f0; }
.vote-score.positive  { color: #4ade80; }
.vote-score.negative  { color: #f87171; }
.vote-score.zero      { color: #475569; }

/* ── Comments button ────────────────────────────────────────────────────────── */
.comment-btn {
  background: none;
  border: 1px solid #1e2d3d;
  color: #475569;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  transition: border-color 0.12s, color 0.12s;
}
.comment-btn:hover     { border-color: #818cf8; color: #818cf8; }
.comment-count         { font-weight: 700; color: #e2e8f0; }

/* ── Modal overlay (shared by submit + comments) ────────────────────────────── */
.sc-modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.65);
  z-index: 200;
  align-items: center;
  justify-content: center;
}
.sc-modal-overlay.open { display: flex; }

.sc-modal {
  background: #0d1117;
  border: 1px solid #1e2d3d;
  border-radius: 12px;
  width: 680px;
  max-width: 95vw;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0,0,0,0.7);
}

.sc-modal-header {
  background: #060b14;
  border-bottom: 1px solid #1e2d3d;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.sc-modal-header h3 { margin: 0; font-size: 15px; color: #e2e8f0; flex: 1; }
.sc-modal-close {
  background: none;
  border: none;
  color: #475569;
  font-size: 16px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.sc-modal-close:hover { color: #e2e8f0; }

.sc-modal-body {
  padding: 18px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sc-modal-footer {
  border-top: 1px solid #1e2d3d;
  padding: 12px 18px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0;
  background: #060b14;
}

/* ── Form elements (submission modal) ──────────────────────────────────────── */
.sc-form-row    { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.sc-form-group  { display: flex; flex-direction: column; gap: 5px; }
.sc-form-group.full { grid-column: 1 / -1; }
.sc-form-label  { font-size: 11px; color: #475569; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
.sc-form-label .req { color: #f87171; }

.sc-input {
  background: #060b14;
  border: 1px solid #1e2d3d;
  border-radius: 6px;
  padding: 8px 10px;
  color: #e2e8f0;
  font-size: 13px;
  font-family: inherit;
  width: 100%;
  box-sizing: border-box;
}
.sc-input:focus { outline: none; border-color: #818cf8; }

.sc-url-grid   { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.sc-url-item   { display: flex; flex-direction: column; gap: 4px; }
.sc-url-label  { font-size: 10px; color: #475569; font-weight: 600; text-transform: uppercase; }
.sc-url-input  {
  background: #060b14;
  border: 1px solid #1e2d3d;
  border-radius: 5px;
  padding: 6px 8px;
  color: #7dd3fc;
  font-size: 11px;
  font-family: 'Share Tech Mono', monospace;
  width: 100%;
  box-sizing: border-box;
}
.sc-url-input:focus { outline: none; border-color: #818cf8; }

/* parts tabs */
.sc-tabs { display: flex; border: 1px solid #1e2d3d; border-radius: 7px; overflow: hidden; width: fit-content; margin-bottom: 10px; }
.sc-tab  { padding: 5px 14px; font-size: 11px; background: none; border: none; color: #475569; cursor: pointer; font-weight: 600; font-family: inherit; }
.sc-tab:not(:last-child) { border-right: 1px solid #1e2d3d; }
.sc-tab.active { background: #818cf8; color: #0f0f23; }

/* parts row table */
.sc-parts-table { background: #060b14; border: 1px solid #1e2d3d; border-radius: 7px; overflow: hidden; }
.sc-parts-row   { display: grid; grid-template-columns: 90px 1fr 28px; border-bottom: 1px solid #1e2d3d; align-items: center; }
.sc-parts-row:last-child { border-bottom: none; }
.sc-parts-cell  { padding: 6px 8px; font-size: 12px; border-right: 1px solid #1e2d3d; }
.sc-parts-cell:last-child { border-right: none; text-align: center; }
.sc-parts-cell.header { font-size: 10px; color: #475569; text-transform: uppercase; background: #0d1117; font-weight: 600; }
.sc-parts-cell input  { background: none; border: none; color: #e2e8f0; font-size: 12px; width: 100%; outline: none; font-family: 'Share Tech Mono', monospace; }
.sc-parts-cell input::placeholder { color: #475569; }
.sc-remove-btn { background: none; border: none; color: #475569; cursor: pointer; font-size: 15px; padding: 0; }
.sc-remove-btn:hover { color: #f87171; }
.sc-add-part-btn {
  background: none; border: 1px dashed #1e2d3d; border-radius: 6px;
  color: #475569; font-size: 12px; padding: 7px; cursor: pointer;
  width: 100%; text-align: center; margin-top: 6px; font-family: inherit;
}
.sc-add-part-btn:hover { border-color: #818cf8; color: #818cf8; }

.sc-json-textarea {
  background: #060b14; border: 1px solid #1e2d3d; border-radius: 7px;
  padding: 10px; color: #7dd3fc; font-size: 11px;
  font-family: 'Share Tech Mono', monospace; width: 100%; box-sizing: border-box;
  resize: vertical; min-height: 120px;
}
.sc-json-textarea:focus { outline: none; border-color: #818cf8; }
.sc-json-hint { font-size: 11px; color: #475569; margin-top: 4px; }
.sc-json-hint code { background: #0d1b2a; padding: 1px 4px; border-radius: 3px; color: #7dd3fc; font-family: 'Share Tech Mono', monospace; }

/* status messages */
.sc-status { font-size: 12px; margin-top: 4px; }
.sc-status.error   { color: #f87171; }
.sc-status.success { color: #4ade80; }

/* buttons */
.sc-btn-cancel {
  background: none; border: 1px solid #1e2d3d; color: #475569;
  padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-family: inherit;
}
.sc-btn-cancel:hover { border-color: #475569; color: #e2e8f0; }
.sc-btn-primary {
  background: #818cf8; border: none; color: #0f0f23;
  padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px;
  font-weight: 700; font-family: inherit;
}
.sc-btn-primary:hover   { background: #a5b4fc; }
.sc-btn-primary:disabled { opacity: 0.5; cursor: default; }

/* ── Submit button in topbar ────────────────────────────────────────────────── */
.submit-layout-btn {
  background: #818cf8; border: none; color: #0f0f23;
  padding: 6px 14px; border-radius: 6px; font-size: 12px;
  font-weight: 700; cursor: pointer; font-family: inherit;
  letter-spacing: 0.02em;
}
.submit-layout-btn:hover { background: #a5b4fc; }

.admin-link {
  color: #fbbf24;
  font-size: 12px;
  text-decoration: none;
  border: 1px solid #92400e;
  padding: 5px 11px;
  border-radius: 6px;
  font-weight: 600;
}
.admin-link:hover { background: #431407; }

/* ── Comments modal ─────────────────────────────────────────────────────────── */
.sc-comment-list   { display: flex; flex-direction: column; gap: 16px; }
.sc-comment        { display: flex; flex-direction: column; gap: 5px; }
.sc-comment-meta   { display: flex; align-items: center; gap: 8px; }
.sc-avatar {
  width: 24px; height: 24px; border-radius: 50%;
  background: #1e1b4b; color: #818cf8; font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.sc-comment-author { font-size: 11px; font-weight: 600; color: #e2e8f0; }
.sc-comment-time   { font-size: 11px; color: #475569; }
.sc-comment-body   { font-size: 12px; color: #e2e8f0; line-height: 1.55; padding-left: 32px; }
.sc-comment-actions { display: flex; gap: 10px; padding-left: 32px; }
.sc-comment-action { background: none; border: none; color: #475569; font-size: 11px; cursor: pointer; padding: 0; font-family: inherit; }
.sc-comment-action:hover { color: #818cf8; }
.sc-comment-replies {
  margin-top: 6px; padding-left: 16px;
  border-left: 2px solid #1e2d3d;
  display: flex; flex-direction: column; gap: 14px;
}
.sc-reply-form { padding-left: 32px; margin-top: 4px; display: flex; gap: 8px; align-items: flex-start; }
.sc-reply-input {
  background: #060b14; border: 1px solid #1e2d3d; border-radius: 6px;
  padding: 7px 10px; color: #e2e8f0; font-size: 12px; font-family: inherit;
  flex: 1; resize: none; height: 60px;
}
.sc-reply-input:focus { outline: none; border-color: #818cf8; }

.sc-new-comment-box {
  border-top: 1px solid #1e2d3d; padding: 14px 18px;
  display: flex; flex-direction: column; gap: 8px;
  background: #060b14; flex-shrink: 0;
}
.sc-new-comment-input {
  background: #0d1117; border: 1px solid #1e2d3d; border-radius: 6px;
  padding: 9px 12px; color: #e2e8f0; font-size: 12px; font-family: inherit;
  resize: none; min-height: 64px;
}
.sc-new-comment-input:focus { outline: none; border-color: #818cf8; }
.sc-comment-signed-out { font-size: 12px; color: #475569; text-align: center; padding: 10px 0; }
.sc-comment-signed-out a { color: #818cf8; cursor: pointer; }

/* ── Admin panel ────────────────────────────────────────────────────────────── */
.admin-shell { max-width: 820px; margin: 0 auto; padding: 20px; }
.admin-tab-bar { display: flex; border-bottom: 1px solid #1e2d3d; margin-bottom: 0; }
.admin-tab {
  padding: 9px 18px; font-size: 13px; color: #475569; cursor: pointer;
  border-bottom: 2px solid transparent; font-weight: 500; font-family: inherit;
  background: none; border-top: none; border-left: none; border-right: none;
}
.admin-tab.active { color: #fbbf24; border-bottom-color: #fbbf24; }
.admin-tab-panel { display: none; }
.admin-tab-panel.active { display: block; }

.admin-card {
  border: 1px solid #1e2d3d; border-radius: 8px; padding: 16px 18px;
  margin-top: 12px; display: flex; flex-direction: column; gap: 10px;
  background: #0d1117;
}
.admin-card-name   { font-size: 14px; font-weight: 700; color: #e2e8f0; }
.admin-card-meta   { font-size: 11px; color: #475569; }
.admin-card-meta b { color: #e2e8f0; }
.admin-parts-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.admin-part-chip {
  background: #0f1923; border: 1px solid #1e2d3d; border-radius: 3px;
  padding: 1px 6px; color: #e2e8f0; font-size: 10px;
  font-family: 'Share Tech Mono', monospace;
}
.admin-actions { display: flex; gap: 8px; align-items: center; }
.admin-btn-approve {
  background: #052e16; border: 1px solid #166534; color: #4ade80;
  border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit;
}
.admin-btn-approve:hover { background: #14532d; }
.admin-btn-reject {
  background: #1c0f0f; border: 1px solid #7f1d1d; color: #f87171;
  border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit;
}
.admin-btn-reject:hover { background: #450a0a; }
.admin-btn-neutral {
  background: none; border: 1px solid #1e2d3d; color: #475569;
  border-radius: 6px; padding: 6px 14px; font-size: 12px; cursor: pointer; font-family: inherit;
}
.admin-btn-neutral:hover { border-color: #475569; color: #e2e8f0; }
.admin-empty { padding: 24px; text-align: center; color: #475569; font-size: 13px; }
.admin-pending-badge {
  background: #fbbf24; color: #0f0f23; border-radius: 99px;
  padding: 1px 8px; font-size: 10px; font-weight: 700; margin-left: 4px;
}
```

- [ ] **Step 2: Verify styles load**

Reload the page. Vote buttons should be styled with dark borders. Community badges visible on any circuit with `submitted_by`.

- [ ] **Step 3: Commit**

```bash
git add css/community.css
git commit -m "feat: community.css — vote, badge, modal, comments, admin styles"
```

---

## Task 7: Voting (`vote.js`)

**Files:**
- Create: `js/vote.js`

- [ ] **Step 1: Create `js/vote.js`**

```js
// Upvote / downvote circuits
"use strict";
// globals: SC, supabase, SUPABASE_URL, SUPABASE_ANON_KEY

var SC = window.SC || {};

SC.vote = {
    _myVotes: {},  // circuit_id -> current user's vote value (1, -1, or 0)

    _client: function () {
        return SC.auth.client;
    },

    loadMyVotes: function () {
        // Fetch current user's votes so buttons show active state on load
        var client = SC.vote._client();
        if (!client || !SC.auth.user) { return; }
        client
            .from('votes')
            .select('circuit_id, value')
            .eq('user_id', SC.auth.user.id)
            .then(function (result) {
                if (result.error || !result.data) { return; }
                result.data.forEach(function (row) {
                    SC.vote._myVotes[row.circuit_id] = row.value;
                });
                SC.vote._refreshAllButtons();
            });
    },

    _refreshAllButtons: function () {
        document.querySelectorAll('.vote-btn').forEach(function (btn) {
            var id  = btn.dataset.circuitId;
            var val = parseInt(btn.dataset.value, 10);
            var my  = SC.vote._myVotes[id] || 0;
            btn.classList.toggle('active', my === val);
        });
    },

    cast: function (circuitId, value, scoreEl, btnUp, btnDown) {
        // Requires sign-in
        if (!SC.auth.user) {
            SC.auth.openModal();
            return;
        }

        var client  = SC.vote._client();
        var current = SC.vote._myVotes[circuitId] || 0;
        var newVal  = (current === value) ? 0 : value;  // toggle off if same direction

        // Optimistic UI
        var oldScore = parseInt(scoreEl.textContent, 10) || 0;
        var delta    = newVal - current;
        var newScore = oldScore + delta;
        scoreEl.textContent = newScore;
        scoreEl.className   = 'vote-score' + (newScore > 0 ? ' positive' : newScore < 0 ? ' negative' : ' zero');
        SC.vote._myVotes[circuitId] = newVal;
        btnUp.classList.toggle('active',    newVal ===  1);
        btnDown.classList.toggle('active',  newVal === -1);

        var doRequest;
        if (newVal === 0) {
            // Remove vote
            doRequest = client.from('votes')
                .delete()
                .eq('circuit_id', circuitId)
                .eq('user_id', SC.auth.user.id);
        } else if (current === 0) {
            // Insert new vote
            doRequest = client.from('votes')
                .insert({ circuit_id: circuitId, user_id: SC.auth.user.id, value: newVal });
        } else {
            // Flip existing vote
            doRequest = client.from('votes')
                .update({ value: newVal })
                .eq('circuit_id', circuitId)
                .eq('user_id', SC.auth.user.id);
        }

        doRequest.then(function (result) {
            if (result.error) {
                // Rollback optimistic update
                scoreEl.textContent = oldScore;
                scoreEl.className   = 'vote-score' + (oldScore > 0 ? ' positive' : oldScore < 0 ? ' negative' : ' zero');
                SC.vote._myVotes[circuitId] = current;
                btnUp.classList.toggle('active',   current ===  1);
                btnDown.classList.toggle('active', current === -1);
                console.error('Vote error:', result.error.message);
            }
        });
    }
};
```

- [ ] **Step 2: Load user's votes after sign-in**

In `js/auth.js`, find:
```js
            if (event === 'SIGNED_IN' && !wasSignedIn) {
                SC.sync.onSignIn();
            }
```
Add `SC.vote.loadMyVotes();` after `SC.sync.onSignIn();`:
```js
            if (event === 'SIGNED_IN' && !wasSignedIn) {
                SC.sync.onSignIn();
                SC.vote.loadMyVotes();
            }
```

- [ ] **Step 3: Verify voting works**

1. Sign in via magic link.
2. Click ▲ on any circuit — score should increment immediately.
3. Click ▲ again — score should return to original (toggle off).
4. Click ▼ — score decrements.
5. Refresh page — active vote state should be restored (buttons highlight).
6. Sign out — buttons should still show scores but clicking ▲/▼ should open the sign-in modal.

- [ ] **Step 4: Commit**

```bash
git add js/vote.js js/auth.js
git commit -m "feat: vote.js — upvote/downvote with optimistic UI"
```

---

## Task 8: Submission Form (`submit.js`)

**Files:**
- Create: `js/submit.js`
- Modify: `index.html`

- [ ] **Step 1: Add submission modal HTML to `index.html`**

Before the closing `</body>` tag, add:

```html
    <!-- ══ Submit layout modal ═════════════════════════════════════════ -->
    <div class="sc-modal-overlay" id="submit-modal-overlay">
      <div class="sc-modal">
        <div class="sc-modal-header">
          <h3>+ Submit layout</h3>
          <button class="sc-modal-close" id="submit-modal-close">✕</button>
        </div>
        <div class="sc-modal-body">
          <div class="sc-form-row">
            <div class="sc-form-group">
              <span class="sc-form-label">Circuit name <span class="req">*</span></span>
              <input class="sc-input" id="submit-name" placeholder="e.g. Fuzz War Clone" autocomplete="off" />
            </div>
            <div class="sc-form-group">
              <span class="sc-form-label">Author / designer</span>
              <input class="sc-input" id="submit-author" placeholder="e.g. Death by Audio" autocomplete="off" />
            </div>
          </div>

          <div class="sc-form-group full">
            <span class="sc-form-label">Layout links</span>
            <div class="sc-url-grid">
              <div class="sc-url-item"><div class="sc-url-label">Schematic</div><input class="sc-url-input" id="submit-url-schematic" placeholder="https://…" /></div>
              <div class="sc-url-item"><div class="sc-url-label">Stripboard</div><input class="sc-url-input" id="submit-url-stripboard" placeholder="https://…" /></div>
              <div class="sc-url-item"><div class="sc-url-label">Perfboard</div><input class="sc-url-input" id="submit-url-perfboard" placeholder="https://…" /></div>
              <div class="sc-url-item"><div class="sc-url-label">PCB</div><input class="sc-url-input" id="submit-url-pcb" placeholder="https://…" /></div>
              <div class="sc-url-item"><div class="sc-url-label">Tagboard</div><input class="sc-url-input" id="submit-url-tagboard" placeholder="https://…" /></div>
              <div class="sc-url-item"><div class="sc-url-label">Demo 🎵</div><input class="sc-url-input" id="submit-url-demo" placeholder="https://…" /></div>
            </div>
          </div>

          <div class="sc-form-group full">
            <span class="sc-form-label">Components <span class="req">*</span></span>
            <div class="sc-tabs">
              <button class="sc-tab active" id="parts-tab-rows">Row by row</button>
              <button class="sc-tab"        id="parts-tab-json">Paste JSON</button>
            </div>
            <div id="parts-panel-rows">
              <div class="sc-parts-table" id="parts-rows-table">
                <div class="sc-parts-row">
                  <div class="sc-parts-cell header">Designator</div>
                  <div class="sc-parts-cell header">Value</div>
                  <div class="sc-parts-cell header"></div>
                </div>
              </div>
              <button class="sc-add-part-btn" id="parts-add-row">+ Add component</button>
            </div>
            <div id="parts-panel-json" style="display:none">
              <textarea class="sc-json-textarea" id="parts-json-input" placeholder='{"C1": "100n", "R1": "10k", "Q1": "BC549C"}'></textarea>
              <div class="sc-json-hint">Paste a JSON object mapping designator → value. Example: <code>{"R1": "10k", "C1": "100n"}</code></div>
            </div>
          </div>

          <div class="sc-status" id="submit-status"></div>
        </div>
        <div class="sc-modal-footer">
          <button class="sc-btn-cancel" id="submit-modal-cancel">Cancel</button>
          <button class="sc-btn-primary" id="submit-modal-send">Submit for review →</button>
        </div>
      </div>
    </div>
```

Also add the Submit Layout button to the topbar in `index.html`.  
Find:
```html
            <div class="auth-widget" id="auth-widget"></div>
```
Add before it:
```html
            <button class="submit-layout-btn" id="submit-layout-btn">+ Submit layout</button>
            <a class="admin-link" id="admin-link" href="admin.html" style="display:none">⚙ Admin</a>
```

- [ ] **Step 2: Create `js/submit.js`**

```js
// Submission form modal
"use strict";
// globals: document, SC

var SC = window.SC || {};

SC.submit = {

    open: function () {
        if (!SC.auth.user) {
            SC.auth.openModal();
            return;
        }
        var overlay = document.getElementById('submit-modal-overlay');
        if (overlay) { overlay.classList.add('open'); }
        SC.submit._resetForm();
    },

    close: function () {
        var overlay = document.getElementById('submit-modal-overlay');
        if (overlay) { overlay.classList.remove('open'); }
    },

    _resetForm: function () {
        var ids = ['submit-name', 'submit-author', 'submit-url-schematic',
                   'submit-url-stripboard', 'submit-url-perfboard', 'submit-url-pcb',
                   'submit-url-tagboard', 'submit-url-demo', 'parts-json-input'];
        ids.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) { el.value = ''; }
        });
        var status = document.getElementById('submit-status');
        if (status) { status.textContent = ''; status.className = 'sc-status'; }
        // Reset parts rows to empty table (keep header)
        var table = document.getElementById('parts-rows-table');
        if (table) {
            while (table.children.length > 1) { table.removeChild(table.lastChild); }
        }
        SC.submit._addPartRow();
        SC.submit._addPartRow();
        // Reset to rows tab
        SC.submit._switchTab('rows');
    },

    _switchTab: function (tab) {
        document.getElementById('parts-tab-rows').classList.toggle('active', tab === 'rows');
        document.getElementById('parts-tab-json').classList.toggle('active', tab === 'json');
        document.getElementById('parts-panel-rows').style.display = tab === 'rows' ? '' : 'none';
        document.getElementById('parts-panel-json').style.display = tab === 'json' ? '' : 'none';
    },

    _addPartRow: function () {
        var table = document.getElementById('parts-rows-table');
        if (!table) { return; }
        var row   = document.createElement('div');
        row.className = 'sc-parts-row';
        var cellDes = document.createElement('div');
        cellDes.className = 'sc-parts-cell';
        var inDes = document.createElement('input');
        inDes.placeholder = 'C1';
        cellDes.appendChild(inDes);

        var cellVal = document.createElement('div');
        cellVal.className = 'sc-parts-cell';
        var inVal = document.createElement('input');
        inVal.placeholder = '100n';
        cellVal.appendChild(inVal);

        var cellBtn = document.createElement('div');
        cellBtn.className = 'sc-parts-cell';
        var btn = document.createElement('button');
        btn.className = 'sc-remove-btn';
        btn.textContent = '×';
        btn.onclick = function () { table.removeChild(row); };
        cellBtn.appendChild(btn);

        row.appendChild(cellDes);
        row.appendChild(cellVal);
        row.appendChild(cellBtn);
        table.appendChild(row);
    },

    _collectParts: function () {
        // Returns {ok: true, parts: {...}} or {ok: false, error: '...'}
        var jsonPanel = document.getElementById('parts-panel-json');
        if (jsonPanel.style.display !== 'none') {
            // JSON tab active
            var raw = document.getElementById('parts-json-input').value.trim();
            if (!raw) { return { ok: false, error: 'Parts list is required.' }; }
            try {
                var parsed = JSON.parse(raw);
                if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                    return { ok: false, error: 'Parts must be a JSON object like {"R1": "10k"}.' };
                }
                return { ok: true, parts: parsed };
            } catch (e) {
                return { ok: false, error: 'Invalid JSON: ' + e.message };
            }
        }
        // Row tab active
        var table = document.getElementById('parts-rows-table');
        var rows  = table.querySelectorAll('.sc-parts-row:not(:first-child)');
        var parts = {};
        var hasAny = false;
        rows.forEach(function (row) {
            var inputs = row.querySelectorAll('input');
            var des = inputs[0].value.trim();
            var val = inputs[1].value.trim();
            if (des && val) {
                parts[des] = val;
                hasAny = true;
            }
        });
        if (!hasAny) { return { ok: false, error: 'Add at least one component.' }; }
        return { ok: true, parts: parts };
    },

    send: function () {
        var nameEl   = document.getElementById('submit-name');
        var statusEl = document.getElementById('submit-status');
        var sendBtn  = document.getElementById('submit-modal-send');

        var name = nameEl ? nameEl.value.trim() : '';
        if (!name) {
            statusEl.textContent = 'Circuit name is required.';
            statusEl.className = 'sc-status error';
            return;
        }

        var partsResult = SC.submit._collectParts();
        if (!partsResult.ok) {
            statusEl.textContent = partsResult.error;
            statusEl.className = 'sc-status error';
            return;
        }

        sendBtn.disabled = true;
        sendBtn.textContent = 'Submitting…';
        statusEl.textContent = '';
        statusEl.className = 'sc-status';

        var key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

        var row = {
            key:            key + '_' + Date.now(),
            name:           name,
            author:         (document.getElementById('submit-author').value.trim()) || null,
            url_schematic:  (document.getElementById('submit-url-schematic').value.trim())  || null,
            url_stripboard: (document.getElementById('submit-url-stripboard').value.trim()) || null,
            url_perfboard:  (document.getElementById('submit-url-perfboard').value.trim())  || null,
            url_pcb:        (document.getElementById('submit-url-pcb').value.trim())        || null,
            url_tagboard:   (document.getElementById('submit-url-tagboard').value.trim())   || null,
            url_pedal:      null,
            url_demo:       (document.getElementById('submit-url-demo').value.trim())       || null,
            parts:          partsResult.parts,
            status:         'pending',
            submitted_by:   SC.auth.user.id
        };

        SC.auth.client.from('circuits').insert(row).then(function (result) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Submit for review →';
            if (result.error) {
                statusEl.textContent = 'Error: ' + result.error.message;
                statusEl.className = 'sc-status error';
            } else {
                statusEl.textContent = '✓ Submitted! We\'ll review it shortly.';
                statusEl.className = 'sc-status success';
                setTimeout(SC.submit.close, 2000);
            }
        });
    },

    init: function () {
        var openBtn   = document.getElementById('submit-layout-btn');
        var closeBtn  = document.getElementById('submit-modal-close');
        var cancelBtn = document.getElementById('submit-modal-cancel');
        var sendBtn   = document.getElementById('submit-modal-send');
        var addRow    = document.getElementById('parts-add-row');
        var tabRows   = document.getElementById('parts-tab-rows');
        var tabJson   = document.getElementById('parts-tab-json');
        var overlay   = document.getElementById('submit-modal-overlay');

        if (openBtn)   { openBtn.onclick   = SC.submit.open; }
        if (closeBtn)  { closeBtn.onclick  = SC.submit.close; }
        if (cancelBtn) { cancelBtn.onclick = SC.submit.close; }
        if (sendBtn)   { sendBtn.onclick   = SC.submit.send; }
        if (addRow)    { addRow.onclick    = SC.submit._addPartRow; }
        if (tabRows)   { tabRows.onclick   = function () { SC.submit._switchTab('rows'); }; }
        if (tabJson)   { tabJson.onclick   = function () { SC.submit._switchTab('json'); }; }
        if (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) { SC.submit.close(); }
            });
        }
        SC.submit._addPartRow();
        SC.submit._addPartRow();
    }
};
```

- [ ] **Step 3: Call `SC.submit.init()` in the boot sequence**

In `js/index.js`, inside `SC.loadCircuits().then(function () { ... })`, add at the end:
```js
        SC.submit.init();
```

- [ ] **Step 4: Show Admin link for admin users**

In `js/auth.js`, find the `updateWidget` function. After `SC.sync.updateBanner();` at the end, add:

```js
        // Show admin link if user has admin role
        var adminLink = document.getElementById('admin-link');
        if (adminLink && SUPABASE_CONFIGURED && SC.auth.user && SC.auth.client) {
            SC.auth.client
                .from('user_roles')
                .select('role')
                .eq('user_id', SC.auth.user.id)
                .maybeSingle()
                .then(function (result) {
                    adminLink.style.display = (result.data && result.data.role === 'admin') ? '' : 'none';
                });
        } else if (adminLink) {
            adminLink.style.display = 'none';
        }
```

- [ ] **Step 5: Verify submission form**

1. Click `+ Submit layout` — auth modal opens if not signed in.
2. Sign in; click again — submission modal opens.
3. Fill in circuit name only, click Submit — error "Parts list is required."
4. Switch to JSON tab, paste `{"R1": "10k", "C1": "100n"}`, click Submit — success message, modal closes.
5. In Supabase Dashboard → Table Editor → circuits, confirm a new row with `status = 'pending'`.

- [ ] **Step 6: Commit**

```bash
git add js/submit.js js/auth.js index.html
git commit -m "feat: submit.js — circuit submission modal with two-tab parts entry"
```

---

## Task 9: Comments Modal (`comments.js`)

**Files:**
- Create: `js/comments.js`
- Modify: `index.html`

- [ ] **Step 1: Add comments modal HTML to `index.html`**

Before the closing `</body>` tag (after the submit modal), add:

```html
    <!-- ══ Comments modal ══════════════════════════════════════════════ -->
    <div class="sc-modal-overlay" id="comments-modal-overlay">
      <div class="sc-modal">
        <div class="sc-modal-header">
          <div>
            <h3 id="comments-modal-title">💬 Comments</h3>
            <div style="font-size:11px;color:#475569" id="comments-modal-circuit"></div>
          </div>
          <button class="sc-modal-close" id="comments-modal-close">✕</button>
        </div>
        <div class="sc-modal-body" id="comments-modal-body">
          <div class="sc-comment-list" id="comments-list"></div>
        </div>
        <div id="comments-post-box"></div>
      </div>
    </div>
```

- [ ] **Step 2: Create `js/comments.js`**

```js
// Threaded comments modal
"use strict";
// globals: document, SC

var SC = window.SC || {};

SC.comments = {
    _upvotedComments: JSON.parse(localStorage.getItem('SC.upvotedComments') || '{}'),

    open: function (circuitId, circuitName, circuitKey) {
        var overlay = document.getElementById('comments-modal-overlay');
        var title   = document.getElementById('comments-modal-title');
        var sub     = document.getElementById('comments-modal-circuit');
        if (!overlay) { return; }

        title.textContent = '💬 Comments';
        sub.textContent   = circuitName;
        overlay.classList.add('open');
        overlay.dataset.circuitId  = circuitId;
        overlay.dataset.circuitKey = circuitKey;

        SC.comments._loadAndRender(circuitId);
        SC.comments._renderPostBox(circuitId, null);
    },

    close: function () {
        var overlay = document.getElementById('comments-modal-overlay');
        if (overlay) { overlay.classList.remove('open'); }
    },

    _loadAndRender: function (circuitId) {
        var list = document.getElementById('comments-list');
        if (!list) { return; }
        list.textContent = 'Loading…';

        var client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        client
            .from('comments')
            .select('id, parent_id, user_id, body, vote_score, created_at')
            .eq('circuit_id', circuitId)
            .order('created_at', { ascending: true })
            .then(function (result) {
                list.textContent = '';
                if (result.error) {
                    list.textContent = 'Could not load comments.';
                    return;
                }
                if (!result.data || result.data.length === 0) {
                    list.innerHTML = '<div style="color:#475569;font-size:12px;text-align:center;padding:20px 0">No comments yet. Be the first!</div>';
                    SC.comments._updateCount(circuitId, 0);
                    return;
                }
                SC.comments._updateCount(circuitId, result.data.length);
                var tree = SC.comments._buildTree(result.data);
                tree.forEach(function (node) {
                    list.appendChild(SC.comments._renderNode(node, circuitId, 0));
                });
            });
    },

    _buildTree: function (rows) {
        var map = {}, roots = [], i, row;
        for (i = 0; i < rows.length; i++) {
            map[rows[i].id] = { data: rows[i], children: [] };
        }
        for (i = 0; i < rows.length; i++) {
            row = rows[i];
            if (row.parent_id && map[row.parent_id]) {
                map[row.parent_id].children.push(map[row.id]);
            } else {
                roots.push(map[row.id]);
            }
        }
        return roots;
    },

    _relativeTime: function (iso) {
        var diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
        if (diff < 60)   { return diff + 's ago'; }
        if (diff < 3600) { return Math.floor(diff / 60) + 'm ago'; }
        if (diff < 86400){ return Math.floor(diff / 3600) + 'h ago'; }
        return Math.floor(diff / 86400) + 'd ago';
    },

    _renderNode: function (node, circuitId, depth) {
        var data = node.data;
        var wrap = document.createElement('div');
        wrap.className = 'sc-comment';

        // meta row
        var meta   = document.createElement('div');
        meta.className = 'sc-comment-meta';
        var avatar = document.createElement('div');
        avatar.className = 'sc-avatar';
        avatar.textContent = (data.user_id || 'A').slice(0, 1).toUpperCase();
        var author = document.createElement('span');
        author.className = 'sc-comment-author';
        author.textContent = data.user_id ? data.user_id.slice(0, 8) + '…' : 'anon';
        var time   = document.createElement('span');
        time.className = 'sc-comment-time';
        time.textContent = SC.comments._relativeTime(data.created_at);
        meta.appendChild(avatar);
        meta.appendChild(author);
        meta.appendChild(time);
        wrap.appendChild(meta);

        // body
        var body = document.createElement('div');
        body.className = 'sc-comment-body';
        body.textContent = data.body;
        wrap.appendChild(body);

        // actions (upvote + reply)
        var actions = document.createElement('div');
        actions.className = 'sc-comment-actions';
        var upBtn = document.createElement('button');
        upBtn.className = 'sc-comment-action';
        var alreadyUpvoted = !!SC.comments._upvotedComments[data.id];
        upBtn.textContent = '↑ ' + (data.vote_score || 0);
        if (alreadyUpvoted) { upBtn.style.color = '#4ade80'; }
        upBtn.onclick = function () { SC.comments._upvote(data.id, upBtn); };

        var replyBtn = document.createElement('button');
        replyBtn.className = 'sc-comment-action';
        replyBtn.textContent = '↩ Reply';
        replyBtn.onclick = function () { SC.comments._renderPostBox(circuitId, data.id, wrap); };

        actions.appendChild(upBtn);
        if (depth < 3) { actions.appendChild(replyBtn); }
        wrap.appendChild(actions);

        // children
        if (node.children.length > 0) {
            var replies = document.createElement('div');
            replies.className = 'sc-comment-replies';
            node.children.forEach(function (child) {
                replies.appendChild(SC.comments._renderNode(child, circuitId, depth + 1));
            });
            wrap.appendChild(replies);
        }

        return wrap;
    },

    _upvote: function (commentId, btn) {
        if (SC.comments._upvotedComments[commentId]) { return; }
        if (!SC.auth.user) { SC.auth.openModal(); return; }

        SC.auth.client.rpc('increment_comment_vote', { comment_id: commentId }).then(function (result) {
            if (!result.error) {
                SC.comments._upvotedComments[commentId] = 1;
                localStorage.setItem('SC.upvotedComments', JSON.stringify(SC.comments._upvotedComments));
                var current = parseInt(btn.textContent.replace('↑ ', ''), 10) || 0;
                btn.textContent = '↑ ' + (current + 1);
                btn.style.color = '#4ade80';
            }
        });
    },

    _renderPostBox: function (circuitId, parentId, insertAfter) {
        var box = document.getElementById('comments-post-box');
        if (!box) { return; }
        box.innerHTML = '';

        if (!SC.auth.user) {
            box.innerHTML = '<div class="sc-comment-signed-out">Sign in to join the discussion. <a id="comments-signin-link">Sign in →</a></div>';
            var link = document.getElementById('comments-signin-link');
            if (link) { link.onclick = function () { SC.comments.close(); SC.auth.openModal(); }; }
            return;
        }

        var wrap    = document.createElement('div');
        wrap.className = 'sc-new-comment-box';
        var textarea = document.createElement('textarea');
        textarea.className = 'sc-new-comment-input';
        textarea.placeholder = parentId ? 'Write a reply…' : 'Add a comment…';
        var footer  = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px';
        if (parentId) {
            var cancelReply = document.createElement('button');
            cancelReply.className = 'sc-btn-cancel';
            cancelReply.textContent = 'Cancel';
            cancelReply.onclick = function () { SC.comments._renderPostBox(circuitId, null); };
            footer.appendChild(cancelReply);
        }
        var postBtn = document.createElement('button');
        postBtn.className = 'sc-btn-primary';
        postBtn.textContent = parentId ? 'Reply →' : 'Post →';
        postBtn.onclick = function () {
            SC.comments._post(circuitId, parentId, textarea.value, postBtn);
        };
        footer.appendChild(postBtn);
        wrap.appendChild(textarea);
        wrap.appendChild(footer);
        box.appendChild(wrap);
    },

    _post: function (circuitId, parentId, body, btn) {
        body = body.trim();
        if (!body) { return; }
        if (!SC.auth.user) { SC.auth.openModal(); return; }

        btn.disabled = true;
        btn.textContent = 'Posting…';

        SC.auth.client.from('comments').insert({
            circuit_id: circuitId,
            user_id:    SC.auth.user.id,
            parent_id:  parentId || null,
            body:       body
        }).then(function (result) {
            btn.disabled = false;
            btn.textContent = parentId ? 'Reply →' : 'Post →';
            if (!result.error) {
                SC.comments._loadAndRender(circuitId);
                SC.comments._renderPostBox(circuitId, null);
            }
        });
    },

    _updateCount: function (circuitId, count) {
        document.querySelectorAll('.comment-count').forEach(function (el) {
            var btn = el.closest('button');
            if (btn && btn.onclick && btn.onclick.toString().indexOf(circuitId) !== -1) {
                el.textContent = count;
            }
        });
    },

    init: function () {
        var closeBtn = document.getElementById('comments-modal-close');
        var overlay  = document.getElementById('comments-modal-overlay');
        if (closeBtn) { closeBtn.onclick = SC.comments.close; }
        if (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) { SC.comments.close(); }
            });
        }
    }
};
```

- [ ] **Step 3: Call `SC.comments.init()` in boot sequence**

In `js/index.js`, inside the `SC.loadCircuits().then(...)` callback, after `SC.submit.init();` add:
```js
        SC.comments.init();
```

- [ ] **Step 4: Verify comments**

1. Click 💬 on any circuit — modal opens with "No comments yet."
2. Sign in; click 💬 again — post box appears at bottom.
3. Type a comment and click Post — comment appears in list.
4. Click ↩ Reply on the comment — reply form appears.
5. Post a reply — appears indented under parent comment.
6. Click ↑ on a comment — score increments; can only vote once per page session.

- [ ] **Step 5: Commit**

```bash
git add js/comments.js index.html
git commit -m "feat: comments.js — threaded comments modal with upvoting"
```

---

## Task 10: Moderation Panel (`admin.html` + `admin.js`)

**Files:**
- Create: `admin.html`
- Create: `js/admin.js`

- [ ] **Step 1: Create `admin.html`**

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Admin — What can I build</title>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width" />
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Antonio:wght@400;500;700&family=Share+Tech+Mono&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">

    <link rel="icon" href="image/icon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="css/index.css?version=276" type="text/css" />
    <link rel="stylesheet" href="css/community.css?version=276" type="text/css" />

    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
    <script type="text/javascript" src="js/config.js?version=276"></script>
    <script type="text/javascript" src="js/auth.js?version=276"></script>
    <script type="text/javascript" src="js/admin.js?version=276"></script>
  </head>
  <body>
    <div class="topbar" style="margin-bottom:0">
      <h1 style="font-size:16px">⚙ Admin — Moderation</h1>
      <a href="index.html" style="color:#475569;font-size:12px;margin-left:auto">← Back to app</a>
      <div class="auth-widget" id="auth-widget"></div>
    </div>

    <div class="admin-shell">
      <div id="admin-access-denied" style="display:none;padding:40px;text-align:center;color:#f87171">
        Access denied. You need admin privileges to view this page.
        <br><br><a href="index.html" style="color:#818cf8">← Go back</a>
      </div>

      <div id="admin-content" style="display:none">
        <div class="admin-tab-bar">
          <button class="admin-tab active" data-tab="pending">Pending <span class="admin-pending-badge" id="pending-badge">0</span></button>
          <button class="admin-tab" data-tab="approved">Approved</button>
          <button class="admin-tab" data-tab="rejected">Rejected</button>
          <button class="admin-tab" data-tab="admins">Manage Admins</button>
        </div>

        <div class="admin-tab-panel active" id="panel-pending">
          <div id="pending-list"></div>
        </div>

        <div class="admin-tab-panel" id="panel-approved">
          <div id="approved-list"></div>
        </div>

        <div class="admin-tab-panel" id="panel-rejected">
          <div id="rejected-list"></div>
        </div>

        <div class="admin-tab-panel" id="panel-admins">
          <div style="margin-top:16px;display:flex;gap:10px;align-items:center">
            <input class="sc-input" id="grant-email-input" placeholder="user@email.com" style="max-width:280px" />
            <button class="sc-btn-primary" id="grant-admin-btn">Grant admin</button>
          </div>
          <div class="sc-status" id="grant-status" style="margin-top:8px"></div>
          <div id="admins-list" style="margin-top:16px"></div>
        </div>
      </div>
    </div>

    <script>
      window.addEventListener('DOMContentLoaded', function () {
        SC.auth.init();
        // Wait for auth state, then check admin
        var checked = false;
        var checkAdmin = function () {
          if (checked) { return; }
          checked = true;
          SC.admin.checkAccessAndInit();
        };
        // Try immediately (session may already be loaded)
        setTimeout(checkAdmin, 800);
        SC.auth.client.auth.onAuthStateChange(function () { checkAdmin(); });
      });
    </script>
  </body>
</html>
```

- [ ] **Step 2: Create `js/admin.js`**

```js
// Moderation panel logic
"use strict";
// globals: document, SC, supabase, SUPABASE_URL, SUPABASE_ANON_KEY

var SC = window.SC || {};

SC.admin = {

    checkAccessAndInit: function () {
        if (!SC.auth.user) {
            document.getElementById('admin-access-denied').style.display = 'block';
            return;
        }
        SC.auth.client
            .from('user_roles')
            .select('role')
            .eq('user_id', SC.auth.user.id)
            .maybeSingle()
            .then(function (result) {
                if (result.data && result.data.role === 'admin') {
                    document.getElementById('admin-content').style.display = 'block';
                    SC.admin._initTabs();
                    SC.admin.loadPanel('pending');
                    SC.admin._initGrantAdmin();
                } else {
                    document.getElementById('admin-access-denied').style.display = 'block';
                }
            });
    },

    _initTabs: function () {
        document.querySelectorAll('.admin-tab').forEach(function (tab) {
            tab.onclick = function () {
                document.querySelectorAll('.admin-tab').forEach(function (t) { t.classList.remove('active'); });
                document.querySelectorAll('.admin-tab-panel').forEach(function (p) { p.classList.remove('active'); });
                tab.classList.add('active');
                var panelId = 'panel-' + tab.dataset.tab;
                document.getElementById(panelId).classList.add('active');
                SC.admin.loadPanel(tab.dataset.tab);
            };
        });
    },

    loadPanel: function (tab) {
        if (tab === 'admins') { SC.admin.loadAdmins(); return; }
        var listEl = document.getElementById(tab + '-list');
        if (!listEl) { return; }
        listEl.innerHTML = '<div class="admin-empty">Loading…</div>';

        SC.auth.client
            .from('circuits')
            .select('id, key, name, author, url_schematic, url_stripboard, url_perfboard, url_pcb, url_tagboard, url_pedal, url_demo, parts, submitted_by, created_at')
            .eq('status', tab === 'approved' ? 'approved' : tab)
            .order('created_at', { ascending: false })
            .then(function (result) {
                listEl.innerHTML = '';
                if (result.error || !result.data || result.data.length === 0) {
                    listEl.innerHTML = '<div class="admin-empty">Nothing here.</div>';
                    if (tab === 'pending') {
                        document.getElementById('pending-badge').textContent = '0';
                    }
                    return;
                }
                if (tab === 'pending') {
                    document.getElementById('pending-badge').textContent = result.data.length;
                }
                result.data.forEach(function (circuit) {
                    listEl.appendChild(SC.admin._renderCard(circuit, tab));
                });
            });
    },

    _renderCard: function (circuit, currentStatus) {
        var card = document.createElement('div');
        card.className = 'admin-card';

        var name = document.createElement('div');
        name.className = 'admin-card-name';
        name.textContent = circuit.name + (circuit.author ? ' — ' + circuit.author : '');
        card.appendChild(name);

        var meta = document.createElement('div');
        meta.className = 'admin-card-meta';
        var partCount = Object.keys(circuit.parts || {}).length;
        meta.innerHTML = 'submitted by <b>' + (circuit.submitted_by || 'seeded') + '</b> &nbsp;·&nbsp; ' +
            new Date(circuit.created_at).toLocaleDateString() + ' &nbsp;·&nbsp; ' + partCount + ' parts';
        card.appendChild(meta);

        // link pills
        var pillRow = document.createElement('div');
        pillRow.className = 'admin-parts-chips';
        ['url_schematic','url_stripboard','url_perfboard','url_pcb','url_tagboard','url_pedal','url_demo'].forEach(function (field) {
            if (circuit[field]) {
                var pill = document.createElement('a');
                pill.className = 'admin-part-chip';
                pill.href = circuit[field];
                pill.target = '_blank';
                pill.textContent = field.replace('url_', '');
                pillRow.appendChild(pill);
            }
        });
        card.appendChild(pillRow);

        // parts chips
        var chips = document.createElement('div');
        chips.className = 'admin-parts-chips';
        var parts = circuit.parts || {};
        var keys = Object.keys(parts).slice(0, 12);
        keys.forEach(function (k) {
            var chip = document.createElement('span');
            chip.className = 'admin-part-chip';
            chip.textContent = k + ': ' + parts[k];
            chips.appendChild(chip);
        });
        if (Object.keys(parts).length > 12) {
            var more = document.createElement('span');
            more.className = 'admin-part-chip';
            more.textContent = '…+' + (Object.keys(parts).length - 12) + ' more';
            chips.appendChild(more);
        }
        card.appendChild(chips);

        // actions
        var actions = document.createElement('div');
        actions.className = 'admin-actions';

        if (currentStatus !== 'approved') {
            var approveBtn = document.createElement('button');
            approveBtn.className = 'admin-btn-approve';
            approveBtn.textContent = '✓ Approve';
            approveBtn.onclick = function () { SC.admin._setStatus(circuit.id, 'approved', card); };
            actions.appendChild(approveBtn);
        }

        if (currentStatus !== 'rejected') {
            var rejectBtn = document.createElement('button');
            rejectBtn.className = 'admin-btn-reject';
            rejectBtn.textContent = '✕ Reject';
            rejectBtn.onclick = function () { SC.admin._setStatus(circuit.id, 'rejected', card); };
            actions.appendChild(rejectBtn);
        }

        if (currentStatus === 'rejected') {
            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'admin-btn-neutral';
            deleteBtn.textContent = 'Delete permanently';
            deleteBtn.onclick = function () {
                if (confirm('Delete this circuit permanently?')) {
                    SC.admin._deleteCircuit(circuit.id, card);
                }
            };
            actions.appendChild(deleteBtn);
        }

        card.appendChild(actions);
        return card;
    },

    _setStatus: function (circuitId, status, cardEl) {
        SC.auth.client
            .from('circuits')
            .update({ status: status })
            .eq('id', circuitId)
            .then(function (result) {
                if (!result.error) {
                    cardEl.style.opacity = '0.4';
                    setTimeout(function () { cardEl.remove(); }, 400);
                    // Refresh pending badge
                    if (status === 'approved' || status === 'rejected') {
                        var badge = document.getElementById('pending-badge');
                        if (badge) {
                            badge.textContent = Math.max(0, parseInt(badge.textContent, 10) - 1);
                        }
                    }
                }
            });
    },

    _deleteCircuit: function (circuitId, cardEl) {
        SC.auth.client
            .from('circuits')
            .delete()
            .eq('id', circuitId)
            .then(function (result) {
                if (!result.error) { cardEl.remove(); }
            });
    },

    loadAdmins: function () {
        var list = document.getElementById('admins-list');
        if (!list) { return; }
        list.innerHTML = '';

        SC.auth.client
            .from('user_roles')
            .select('user_id, role, granted_at')
            .eq('role', 'admin')
            .then(function (result) {
                if (result.error || !result.data) { return; }
                result.data.forEach(function (row) {
                    var item = document.createElement('div');
                    item.className = 'admin-card';
                    item.style.flexDirection = 'row';
                    item.style.alignItems = 'center';
                    var info = document.createElement('div');
                    info.style.flex = '1';
                    info.innerHTML = '<b>' + row.user_id + '</b> <span style="color:#475569;font-size:11px">— granted ' + new Date(row.granted_at).toLocaleDateString() + '</span>';
                    item.appendChild(info);
                    // Cannot revoke yourself
                    if (row.user_id !== SC.auth.user.id) {
                        var revokeBtn = document.createElement('button');
                        revokeBtn.className = 'admin-btn-reject';
                        revokeBtn.textContent = 'Revoke';
                        revokeBtn.onclick = function () { SC.admin._revokeAdmin(row.user_id, item); };
                        item.appendChild(revokeBtn);
                    }
                    list.appendChild(item);
                });
            });
    },

    _initGrantAdmin: function () {
        var btn    = document.getElementById('grant-admin-btn');
        var input  = document.getElementById('grant-email-input');
        var status = document.getElementById('grant-status');
        if (!btn) { return; }

        btn.onclick = function () {
            var email = input.value.trim();
            if (!email || email.indexOf('@') === -1) {
                status.textContent = 'Enter a valid email.';
                status.className = 'sc-status error';
                return;
            }
            btn.disabled = true;
            // Look up user by email via auth.users (requires admin RPC or service role).
            // Supabase doesn't expose auth.users to the client SDK for security.
            // Workaround: store email in user_roles and look up on the server side.
            // For simplicity, prompt to get UUID from Supabase dashboard and use SQL insert.
            status.textContent = 'To grant admin by email, run in SQL Editor: ' +
                'INSERT INTO public.user_roles (user_id, role) ' +
                'SELECT id, \'admin\' FROM auth.users WHERE email = \'' + email + '\';';
            status.className = 'sc-status';
            btn.disabled = false;
        };
    },

    _revokeAdmin: function (userId, itemEl) {
        SC.auth.client
            .from('user_roles')
            .delete()
            .eq('user_id', userId)
            .then(function (result) {
                if (!result.error) { itemEl.remove(); }
            });
    }
};
```

- [ ] **Step 3: Verify moderation panel**

1. Open `admin.html` while not signed in — "Access denied" message shows.
2. Sign in as the admin user seeded in Task 1 — queue loads.
3. Submit a test circuit via `index.html` (Task 8).
4. Reload `admin.html` — pending badge shows 1.
5. Click Approve — card fades out, badge decrements.
6. Check "Approved" tab — circuit appears there.
7. On `index.html`, reload — approved community circuit appears in the table with the purple "community" badge.

- [ ] **Step 4: Commit**

```bash
git add admin.html js/admin.js
git commit -m "feat: admin.html + admin.js — moderation queue, approve/reject, manage admins"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `circuits` table with status, vote_score, url_demo | Task 1 |
| `votes` table, unique constraint, trigger | Task 1 |
| `comments` table, parent_id threading | Task 1 |
| `user_roles` table | Task 1 |
| `is_admin()` helper to avoid RLS recursion | Task 1 |
| RLS policies for all tables | Task 1 |
| Seed 500+ circuits from circuit/*.json | Task 2 |
| `community.js` — load circuits from Supabase | Task 3 |
| Reconstruct `url` object from flat columns | Task 3 |
| Async boot sequence | Task 4 |
| Vote + Comments columns in table headers | Task 5 |
| Community badge | Task 5 |
| demo link pill | Task 5 (via URL_LABELS update) |
| CSS for all new UI | Task 6 |
| Upvote/downvote with optimistic UI | Task 7 |
| Toggle vote off by clicking again | Task 7 |
| Load user's prior votes on sign-in | Task 7 |
| Submit layout modal | Task 8 |
| Row-by-row parts entry | Task 8 |
| Paste JSON parts entry | Task 8 |
| Auth gate (prompts sign-in if not authenticated) | Task 8 |
| Admin link in topbar (admin only) | Task 8 |
| Comments modal (centered) | Task 9 |
| Threaded adjacency list rendering | Task 9 |
| Comment upvote (RPC, localStorage dedup) | Task 9 |
| Reply form with parent_id | Task 9 |
| Auth gate on posting | Task 9 |
| Moderation panel with Pending/Approved/Rejected tabs | Task 10 |
| Approve / Reject / Delete actions | Task 10 |
| Manage Admins tab | Task 10 |
| Redirect non-admins away | Task 10 |

All spec requirements covered. ✓
