# What Could I Build — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "What I Could Build" section to `index.html` showing circuits missing ≤ 3 parts, and redesign the whole UI with a modern dark theme.

**Architecture:** Pure static HTML/CSS/JS — no build step. CSS custom properties carry the dark theme. JS splits the existing `SC.filter()` output (which already calculates `errors[]` per circuit) into two rendered tables: `table_ok` (0 errors) and `table_almost` (1–3 errors). Six files touched; no new files.

**Tech Stack:** Vanilla HTML5, CSS3 (custom properties), ES5 JavaScript (matches existing codebase style)

**Verification method:** Open `index.html` via the Python dev server (`python3 -m http.server 8080` from project root), then visit `http://localhost:8080`.

---

## File Map

| File | Change |
|---|---|
| `css/index.css` | Full rewrite — dark CSS vars, topbar, section headers, badges |
| `css/sidebar.css` | Full rewrite — dark sidebar, compact grid, blue-tinted filled inputs |
| `css/table.css` | Full rewrite — dark table, `.missing-chip`, `.circuit-name`, `.circuit-author` |
| `css/mobile.css` | Update mobile breakpoints for dark theme |
| `index.html` | Restructure main: topbar, two section headers, two `<tbody>` elements |
| `js/render.js` | Add `SC.renderAlmost()`, update `SC.renderOne()` and `SC.renderUrl()`, add `SC.URL_LABELS` |
| `js/index.js` | Rewrite `SC.refresh()` to populate both tables, update badge/count elements |

---

## Task 1: CSS Custom Properties and Dark Base Styles

**Files:**
- Rewrite: `css/index.css`

- [ ] **Step 1: Replace `css/index.css` entirely**

```css
/* style for index.html */

:root {
  --bg: #060b14;
  --surface: #0d1117;
  --surface2: #0a0f1a;
  --border: #1e2d3d;
  --text: #e2e8f0;
  --text-muted: #475569;
  --text-dim: #64748b;
  --green: #4ade80;
  --green-bg: #052e16;
  --green-border: #166534;
  --indigo: #818cf8;
  --indigo-bg: #1e1b4b;
  --indigo-border: #3730a3;
  --blue: #93c5fd;
  --blue-bg: #0c1e35;
  --blue-border: #1d4ed8;
  --red-chip-bg: #1c0f0f;
  --red-chip-border: #7f1d1d;
  --red-chip-text: #f87171;
}

body {
  margin: 0;
  display: flex;
  width: 100vw;
  height: 100vh;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  background: var(--bg);
  color: var(--text);
}

main {
  box-sizing: border-box;
  flex: 1;
  overflow-y: scroll;
  max-height: 100vh;
}

/* Topbar */
.topbar {
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--surface2);
  display: flex;
  align-items: center;
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 10;
  flex-wrap: wrap;
}

.topbar h1 {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
  padding: 0;
}

.badge {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 999px;
  font-weight: 600;
}

.badge-green {
  background: var(--green-bg);
  color: var(--green);
  border: 1px solid var(--green-border);
}

.badge-indigo {
  background: var(--indigo-bg);
  color: var(--indigo);
  border: 1px solid var(--indigo-border);
}

.filters {
  display: flex;
  gap: 10px;
  margin-left: auto;
  flex-wrap: wrap;
  align-items: center;
  font-size: 12px;
  color: var(--text-muted);
}

.filters label {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
}

.filters label span {
  color: var(--text-dim);
}

.filters label input[type=checkbox] {
  accent-color: var(--blue);
  cursor: pointer;
}

/* Section headers */
.section-header {
  padding: 18px 20px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-header h1 {
  font-size: 13px;
  font-weight: 700;
  margin: 0;
  padding: 0;
}

.section-header h1.green { color: var(--green); }
.section-header h1.indigo { color: var(--indigo); }

.section-count {
  font-size: 11px;
  color: var(--text-muted);
}

.section-divider {
  margin: 0 20px;
  height: 1px;
  background: var(--border);
}

/* Divider between the two main sections */
.almost-divider {
  margin-top: 28px;
  border-top: 1px solid var(--border);
  background: linear-gradient(to bottom, #0d0e1f 0%, transparent 80%);
}

label {
  user-select: none;
}

#nothing {
  padding: 20px;
  color: var(--text-muted);
}
```

- [ ] **Step 2: Start dev server and open browser**

```bash
cd "/Users/macbook/what can i build" && python3 -m http.server 8080
```

Open `http://localhost:8080` — page will look broken (still white sidebar, unstyled elements) because only `index.css` has changed. That's expected.

- [ ] **Step 3: Commit**

```bash
git add css/index.css
git commit -m "feat: dark theme CSS variables and base layout styles"
```

---

## Task 2: Dark Sidebar CSS

**Files:**
- Rewrite: `css/sidebar.css`

- [ ] **Step 1: Replace `css/sidebar.css` entirely**

```css
/* dark sidebar */

#sidebar {
  height: 100%;
  overflow-y: scroll;
  box-sizing: border-box;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 10;
  font-size: 12px;
  user-select: none;
  width: 240px;
  padding-bottom: 16px;
}

.sidebar-title {
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--surface);
  z-index: 1;
}

.sidebar-title h1 {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0;
  padding: 0;
  text-align: left;
}

#sidebar h2 {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #334155;
  margin: 12px 0 6px;
  padding: 0 14px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

#sidebar section {
  padding: 0 14px;
  column-count: 2;
  column-gap: 4px;
}

#sidebar section label {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  break-inside: avoid;
  outline: none;
}

#sidebar section label > span {
  flex: 1;
  color: var(--text-muted);
  font-size: 11px;
  text-align: right;
  padding-right: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#sidebar input[type=number] {
  width: 44px;
  background: #131c27;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  padding: 2px 4px;
  font-size: 11px;
  text-align: center;
}

/* Make number input arrows always visible */
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button {
  opacity: 1;
}

.plus10all {
  color: #334155;
  cursor: pointer;
  font-size: 9px;
  font-weight: normal;
  text-transform: none;
  letter-spacing: 0;
  float: none;
}

.plus10all:hover {
  color: var(--blue);
}

#sidebar .bottom {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  margin-top: auto;
  padding-top: 16px;
}

#sidebar .bottom a {
  color: #334155;
  font-size: 11px;
  text-decoration: none;
}

#sidebar .bottom a:hover {
  color: var(--text-muted);
}
```

- [ ] **Step 2: Verify in browser**

Refresh `http://localhost:8080` — the sidebar should now be dark (`#0d1117`) with a thin right border, compact two-column parts grid, and uppercase section labels. The main area still looks unstyled.

- [ ] **Step 3: Commit**

```bash
git add css/sidebar.css
git commit -m "feat: dark sidebar with compact parts grid"
```

---

## Task 3: Dark Table Styles + New Classes

**Files:**
- Rewrite: `css/table.css`

- [ ] **Step 1: Replace `css/table.css` entirely**

```css
/* dark table styling */

table {
  width: 100%;
  border-collapse: collapse;
}

table, tr, td, th {
  border-collapse: collapse;
  margin: 0;
  padding: 0;
}

td {
  vertical-align: top;
}

th {
  padding: 7px 8px 7px 20px;
  text-align: left;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  background: var(--surface2);
  white-space: nowrap;
}

th:last-child {
  padding-right: 20px;
}

th.sticky {
  position: sticky;
  top: 49px;
  z-index: 5;
}

table td {
  padding: 10px 8px 10px 20px;
  border-bottom: 1px solid #111a28;
}

table td:last-child {
  padding-right: 20px;
}

table td.full {
  width: 100%;
}

/* Row hover */
table tr:hover td {
  background: #0e1724;
}

/* Circuit name + author */
.circuit-name {
  font-weight: 600;
  color: var(--text);
  font-size: 13px;
  display: block;
}

.circuit-author {
  color: var(--text-muted);
  font-size: 11px;
  margin-top: 2px;
}

/* Substitution warnings */
table .warning {
  color: #22c55e;
  font-size: 11px;
  margin-top: 3px;
}

/* Error text (kept for non-possible view) */
table .error {
  color: var(--red-chip-text);
  font-size: 11px;
  margin-top: 3px;
}

/* Link column */
.links {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 36px;
}

td a {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 4px;
  background: #131c27;
  border: 1px solid var(--border);
  color: var(--text-dim);
  text-decoration: none;
  white-space: nowrap;
}

td a[href]:not([href=""]):hover {
  background: var(--blue-bg);
  border-color: var(--blue-border);
  color: var(--blue);
}

/* Complexity column */
.complexity {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.complexity b {
  color: var(--text-dim);
}

/* Done label+checkbox (CA.labelCheckbox output) */
table label {
  font-size: 11px;
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

table label input[type=checkbox] {
  accent-color: var(--green);
  cursor: pointer;
}

table td.nowrap {
  white-space: nowrap;
}

/* ─── "Almost" section: missing parts chips ─── */

.missing-parts {
  margin-top: 5px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.missing-chip {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--red-chip-bg);
  border: 1px solid var(--red-chip-border);
  color: var(--red-chip-text);
}

.missing-chip::before {
  content: '− ';
  font-weight: 700;
}
```

- [ ] **Step 2: Verify in browser**

Refresh `http://localhost:8080` — the circuit table rows should now be dark with subtle hover highlight. Column headers are small-caps. Links are pill-shaped. The `.missing-chip` class exists but won't appear yet (no "almost" section in HTML yet).

- [ ] **Step 3: Commit**

```bash
git add css/table.css
git commit -m "feat: dark table styles and missing-chip classes"
```

---

## Task 4: Mobile CSS

**Files:**
- Rewrite: `css/mobile.css`

- [ ] **Step 1: Replace `css/mobile.css` entirely**

```css
/* tweaks for mobile phones */

@media only screen and (max-width: 700px) {
  body {
    display: flex;
    flex-direction: column;
    height: auto;
    min-height: 100vh;
  }

  #sidebar {
    width: 100vw !important;
    max-height: 50vh;
    border-right: none;
    border-bottom: 1px solid var(--border);
  }

  main {
    font-size: 12px;
    max-height: none;
    overflow-y: visible;
  }

  .topbar {
    position: relative;
    top: auto;
  }

  th.sticky {
    position: relative;
    top: auto;
  }

  .filters {
    margin-left: 0;
    width: 100%;
  }
}
```

- [ ] **Step 2: Verify on narrow browser**

Resize browser to under 700px wide — sidebar stacks above main, no horizontal overflow.

- [ ] **Step 3: Commit**

```bash
git add css/mobile.css
git commit -m "feat: mobile dark theme adjustments"
```

---

## Task 5: Restructure index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace the `<nav id="sidebar">` opening section**

Find:
```html
    <nav id="sidebar">

        <h1>What do I have</h1>
```

Replace with:
```html
    <nav id="sidebar">

        <div class="sidebar-title">
            <h1>What do I have</h1>
        </div>
```

- [ ] **Step 2: Replace the entire `<main>` block**

Find:
```html
    <main>

        <header>
            <h1>What can I build <span id="total_count"></span></h1>
        </header>

        <div>
            Show circuits
            <label title="You have all parts (uncheck to see what you need to buy)">
                <input id="filter_show_possible" type="checkbox" checked><span>possible</span>
            </label>
            <label title="Show circuits where you don't have exact part, but you have alternative parts that circuit allows as substitutions">
                <input id="filter_show_subs" type="checkbox" checked><span>with substitution</span>
            </label>
            <label title="Only show circuits you've already built in the table (regardless of their posibility)">
                <input id="filter_show_done" type="checkbox"><span>done</span>
            </label>
        </div>

        <table class="border">
            <thead>
                <tr>
                    <th class="sticky">Links</th>
                    <th class="sticky" style="width: 100%">Circuit</th>
                    <th class="sticky" style="min-width: 10ex;">Parts</th>
                    <th class="sticky">Action</th>
                </tr>
            </thead>
            <tbody id="table_ok">
            </tbody>
        </table>

        <div id="nothing" style="margin-top: 1ex; display: none; color: gray;">
        With the parts you have,
        you cannot build anything, if you want to see what parts are missing,
        uncheck the "possible" checkbox. Circuits with fewest missing parts will be
        shown on top and sorted by easiest first.</div>

    </main>
```

Replace with:
```html
    <main>

        <div class="topbar">
            <h1>What can I build</h1>
            <span id="badge_ready" class="badge badge-green">✓ 0 ready</span>
            <span id="badge_almost" class="badge badge-indigo">✦ 0 almost</span>
            <span id="total_count" style="display:none"></span>
            <div class="filters">
                <label title="Show circuits where you don't have exact part, but you have alternative parts that circuit allows as substitutions">
                    <input id="filter_show_subs" type="checkbox" checked><span>with substitution</span>
                </label>
                <label title="Only show circuits you've already built in the table (regardless of their possibility)">
                    <input id="filter_show_done" type="checkbox"><span>done</span>
                </label>
            </div>
        </div>

        <div class="section-header">
            <span>✅</span>
            <h1 class="green">What I Can Build</h1>
            <span class="section-count" id="count_ready">0 circuits — you have all the parts</span>
        </div>
        <div class="section-divider"></div>

        <table>
            <thead>
                <tr>
                    <th class="sticky">Links</th>
                    <th class="sticky" style="width: 100%">Circuit</th>
                    <th class="sticky" style="min-width: 8ex;">Parts</th>
                    <th class="sticky">Action</th>
                </tr>
            </thead>
            <tbody id="table_ok">
            </tbody>
        </table>

        <div class="almost-divider">
            <div class="section-header">
                <span>✨</span>
                <h1 class="indigo">What I Could Build</h1>
                <span class="section-count" id="count_almost">0 circuits — missing 1–3 parts</span>
            </div>
            <div class="section-divider"></div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Links</th>
                    <th style="width: 100%">Circuit</th>
                    <th style="min-width: 8ex;">Parts</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody id="table_almost">
            </tbody>
        </table>

        <div id="nothing" style="margin-top: 1ex; display: none;">
        Nothing to show. Try entering some parts in the sidebar.</div>

    </main>
```

- [ ] **Step 3: Update version numbers on all `<link>` and `<script>` tags**

Change every `?version=270` to `?version=271` throughout `index.html`. There are 8 occurrences (4 CSS links, 7 script tags).

- [ ] **Step 4: Verify in browser**

Refresh `http://localhost:8080` — you should see the dark topbar with both badges ("✓ 0 ready", "✦ 0 almost"), the "✅ What I Can Build" section header, and the "✨ What I Could Build" section header. Counts will show 0 because the JS hasn't been updated yet.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: restructure index.html with two-section layout and dark topbar"
```

---

## Task 6: Update render.js

**Files:**
- Modify: `js/render.js`

- [ ] **Step 1: Add `SC.URL_LABELS` map and rewrite `SC.renderUrl`**

Find:
```javascript
SC.renderUrl = function (aTd, aIcon, aUrl) {
    // Render one url link with text
    if (!aUrl) {
        return;
    }
    var a = document.createElement('a');
    a.href = aUrl;
    a.textContent = aIcon;
    a.target = '_blank';
    a.style.display = 'block';
    aTd.appendChild(a);
};
```

Replace with:
```javascript
SC.URL_LABELS = {
    schematic: 'sch',
    stripboard: 'strip',
    perfboard: 'perf',
    pcb: 'pcb',
    tagboard: 'tag',
    pedal: 'pedal'
};

SC.renderUrl = function (aContainer, aIcon, aUrl) {
    // Render one url link pill inside aContainer
    if (!aUrl) {
        return;
    }
    var a = document.createElement('a');
    a.href = aUrl;
    a.textContent = SC.URL_LABELS[aIcon] || aIcon;
    a.target = '_blank';
    aContainer.appendChild(a);
};
```

- [ ] **Step 2: Update `SC.renderOne` — links div, circuit-name class, circuit-author class**

Find:
```javascript
SC.renderOne = function (unused, aCircuit, aErrors, aWarnings) {
    // Render one circuit and it's errors or warnings
    var tr, td, e, w, done, k, a, b, span, lc;
    tr = document.createElement('tr');
    // links
    td = document.createElement('td');
    for (k in aCircuit.url) {
        if (aCircuit.url.hasOwnProperty(k)) {
            //console.log(td, k, aCircuit.url[k]);
            SC.renderUrl(td, k, aCircuit.url[k]);
        }
    }
    tr.appendChild(td);
    // name
    td = document.createElement('td');
    tr.appendChild(td);
    td.className = 'full';
    b = document.createElement('b');
    b.textContent = aCircuit.name;
    td.appendChild(b);
    // author
    if (aCircuit.author) {
        span = document.createElement('span');
        span.textContent = ' by ';
        td.appendChild(span);
        b = document.createElement('b');
        b.textContent = aCircuit.author;
        td.appendChild(b);
    }
    // errors
    if (aErrors.length > 0) {
        e = document.createElement('div');
        e.className = 'error';
        e.textContent = 'Missing(' + aErrors.length + '): ' + aErrors.join(', ');
        td.appendChild(e);
    }
    // warnings
    if (aWarnings.length > 0) {
        w = document.createElement('div');
        w.className = 'warning';
        w.textContent = aWarnings.join(', ');
        w.title = "Substitutions";
        td.appendChild(w);
    }
    // complexity
    td = document.createElement('td');
    b = document.createElement('b');
    b.textContent = Object.keys(aCircuit.parts).length + ': ';
    td.appendChild(b);
    td.appendChild(document.createTextNode(SC.complexity(aCircuit)));
    tr.appendChild(td);
    // actions
    td = document.createElement('td');
    lc = CA.labelCheckbox(td, 'done', SC.done[aCircuit.key]);
    lc.checkbox.onclick = function () {
        if (lc.checkbox.checked) {
            SC.done[aCircuit.key] = 1;
        } else {
            delete SC.done[aCircuit.key];
        }
        CA.storage.writeObject('SC.done', SC.done);
    };
    tr.appendChild(td);
    return tr;
};
```

Replace with:
```javascript
SC.renderOne = function (unused, aCircuit, aErrors, aWarnings) {
    // Render one circuit row for the "can build" section
    var tr, td, linksDiv, e, w, k, b, span, lc;
    tr = document.createElement('tr');
    // links
    td = document.createElement('td');
    linksDiv = document.createElement('div');
    linksDiv.className = 'links';
    for (k in aCircuit.url) {
        if (aCircuit.url.hasOwnProperty(k)) {
            SC.renderUrl(linksDiv, k, aCircuit.url[k]);
        }
    }
    td.appendChild(linksDiv);
    tr.appendChild(td);
    // name + author
    td = document.createElement('td');
    td.className = 'full';
    b = document.createElement('b');
    b.className = 'circuit-name';
    b.textContent = aCircuit.name;
    td.appendChild(b);
    if (aCircuit.author) {
        span = document.createElement('div');
        span.className = 'circuit-author';
        span.textContent = 'by ' + aCircuit.author;
        td.appendChild(span);
    }
    // warnings (substitutions)
    if (aWarnings.length > 0) {
        w = document.createElement('div');
        w.className = 'warning';
        w.textContent = aWarnings.join(', ');
        w.title = 'Substitutions';
        td.appendChild(w);
    }
    tr.appendChild(td);
    // complexity
    td = document.createElement('td');
    b = document.createElement('b');
    b.textContent = Object.keys(aCircuit.parts).length + ': ';
    td.appendChild(b);
    td.appendChild(document.createTextNode(SC.complexity(aCircuit)));
    tr.appendChild(td);
    // actions
    td = document.createElement('td');
    lc = CA.labelCheckbox(td, 'done', SC.done[aCircuit.key]);
    lc.checkbox.onclick = function () {
        if (lc.checkbox.checked) {
            SC.done[aCircuit.key] = 1;
        } else {
            delete SC.done[aCircuit.key];
        }
        CA.storage.writeObject('SC.done', SC.done);
    };
    tr.appendChild(td);
    return tr;
};
```

- [ ] **Step 3: Add `SC.renderAlmost` after `SC.renderOne`**

After the closing `};` of `SC.renderOne`, add:

```javascript
SC.renderAlmost = function (unused, aCircuit, aErrors, aWarnings) {
    // Render one circuit row for the "almost" section — shows missing part chips
    var tr, td, linksDiv, missingDiv, chip, w, k, b, span, lc, i;
    tr = document.createElement('tr');
    // links
    td = document.createElement('td');
    linksDiv = document.createElement('div');
    linksDiv.className = 'links';
    for (k in aCircuit.url) {
        if (aCircuit.url.hasOwnProperty(k)) {
            SC.renderUrl(linksDiv, k, aCircuit.url[k]);
        }
    }
    td.appendChild(linksDiv);
    tr.appendChild(td);
    // name + author + missing chips
    td = document.createElement('td');
    td.className = 'full';
    b = document.createElement('b');
    b.className = 'circuit-name';
    b.textContent = aCircuit.name;
    td.appendChild(b);
    if (aCircuit.author) {
        span = document.createElement('div');
        span.className = 'circuit-author';
        span.textContent = 'by ' + aCircuit.author;
        td.appendChild(span);
    }
    // missing parts chips
    missingDiv = document.createElement('div');
    missingDiv.className = 'missing-parts';
    for (i = 0; i < aErrors.length; i++) {
        chip = document.createElement('span');
        chip.className = 'missing-chip';
        chip.textContent = aErrors[i];
        missingDiv.appendChild(chip);
    }
    td.appendChild(missingDiv);
    // warnings (substitutions)
    if (aWarnings.length > 0) {
        w = document.createElement('div');
        w.className = 'warning';
        w.textContent = aWarnings.join(', ');
        w.title = 'Substitutions';
        td.appendChild(w);
    }
    tr.appendChild(td);
    // complexity
    td = document.createElement('td');
    b = document.createElement('b');
    b.textContent = Object.keys(aCircuit.parts).length + ': ';
    td.appendChild(b);
    td.appendChild(document.createTextNode(SC.complexity(aCircuit)));
    tr.appendChild(td);
    // actions
    td = document.createElement('td');
    lc = CA.labelCheckbox(td, 'done', SC.done[aCircuit.key]);
    lc.checkbox.onclick = function () {
        if (lc.checkbox.checked) {
            SC.done[aCircuit.key] = 1;
        } else {
            delete SC.done[aCircuit.key];
        }
        CA.storage.writeObject('SC.done', SC.done);
    };
    tr.appendChild(td);
    return tr;
};
```

- [ ] **Step 4: Verify in browser**

Refresh `http://localhost:8080` — circuit rows in section 1 should now show name in bold, author in muted text below, and links as small pills (sch, pcb, etc.). Section 2 still empty (JS not wired yet).

- [ ] **Step 5: Commit**

```bash
git add js/render.js
git commit -m "feat: add renderAlmost with missing-chip rendering, update renderOne styles"
```

---

## Task 7: Wire Up index.js — Split Refresh Into Two Tables

**Files:**
- Modify: `js/index.js`

- [ ] **Step 1: Replace `SC.refresh`**

Find:
```javascript
SC.refresh = function () {
    // Refresh view of possible circuits after counts update or checkbox change
    var f = SC.filter(SC.circuit, SC.counts),
        opa,
        can = 0,
        rows = 0,
        total = Object.keys(SC.circuit).length;

    SC.e.table_ok.textContent = '';

    opa = SC.e.filter_show_done.checked ? 0.5 : 1;
    SC.e.filter_show_possible.parentElement.style.opacity = opa;
    SC.e.filter_show_subs.parentElement.style.opacity = opa;

    f.forEach(function (a) {
        var tr;
        if (SC.e.filter_show_done.checked) {
            if (SC.done[a.key]) {
                tr = SC.renderOne(a.key, a.circuit, a.errors, a.warnings);
                SC.e.table_ok.appendChild(tr);
            }
            return;
        }
        if (SC.done[a.key]) {
            return;
        }
        if (SC.e.filter_show_possible.checked && a.errors.length > 0) {
            return;
        }
        if (!SC.e.filter_show_possible.checked && a.errors.length <= 0) {
            return;
        }
        if (!SC.e.filter_show_subs.checked && a.warnings.length > 0) {
            return;
        }
        tr = SC.renderOne(a.key, a.circuit, a.errors, a.warnings);
        rows++;
        SC.e.table_ok.appendChild(tr);
        // count possible to build circuits
        if (a.errors.length === 0) {
            if (!SC.done[a.key]) {
                can++;
            }
        }
    });
    SC.e.total_count.textContent = '(' + can + '/' + total + ')';
    SC.e.total_count.title = 'You can build ' + can + ' of total ' + total + ' circuits';
    SC.e.nothing.style.display = (rows <= 0 && !SC.e.filter_show_done.checked) ? 'block' : 'none';
    //SC.lastFilter = f;
};
```

Replace with:
```javascript
SC.refresh = function () {
    // Refresh both sections after counts update or checkbox change
    var f = SC.filter(SC.circuit, SC.counts),
        can = 0,
        almost = 0,
        total = Object.keys(SC.circuit).length,
        tr;

    SC.e.table_ok.textContent = '';
    SC.e.table_almost.textContent = '';

    f.forEach(function (a) {
        // Done filter: show only completed circuits in section 1
        if (SC.e.filter_show_done.checked) {
            if (SC.done[a.key]) {
                tr = SC.renderOne(a.key, a.circuit, a.errors, a.warnings);
                SC.e.table_ok.appendChild(tr);
            }
            return;
        }
        // Skip circuits the user has already marked done
        if (SC.done[a.key]) {
            return;
        }
        // Skip rows that require substitutions if filter is off
        if (!SC.e.filter_show_subs.checked && a.warnings.length > 0) {
            return;
        }
        if (a.errors.length === 0) {
            // Section 1: all parts present
            tr = SC.renderOne(a.key, a.circuit, a.errors, a.warnings);
            SC.e.table_ok.appendChild(tr);
            can++;
        } else if (a.errors.length <= 3) {
            // Section 2: missing 1–3 parts
            tr = SC.renderAlmost(a.key, a.circuit, a.errors, a.warnings);
            SC.e.table_almost.appendChild(tr);
            almost++;
        }
    });

    // Update badges and section counts
    SC.e.badge_ready.textContent = '✓ ' + can + ' ready';
    SC.e.badge_almost.textContent = '✦ ' + almost + ' almost';
    SC.e.count_ready.textContent = can + ' circuits — you have all the parts';
    SC.e.count_almost.textContent = almost + ' circuits — missing 1–3 parts';
    SC.e.total_count.textContent = '(' + can + '/' + total + ')';
    SC.e.nothing.style.display = (can <= 0 && almost <= 0 && !SC.e.filter_show_done.checked) ? 'block' : 'none';
};
```

- [ ] **Step 2: Update the `DOMContentLoaded` event listener**

Find:
```javascript
window.addEventListener('DOMContentLoaded', function () {
    SC.e = CA.elementsWithId();
    SC.e.filter_show_possible.onclick = SC.refresh;
    SC.e.filter_show_subs.onclick = SC.refresh;
    SC.e.filter_show_done.onclick = SC.refresh;
    SC.e.plus_10_resistor.onclick = SC.plusTenAll;
    SC.e.plus_10_capacitor.onclick = SC.plusTenAll;
    SC.e.plus_10_pot.onclick = SC.plusTenAll;
    SC.e.plus_10_pot_trimmer.onclick = SC.plusTenAll;
    SC.e.plus_10_diode.onclick = SC.plusTenAll;
    SC.e.plus_10_switch.onclick = SC.plusTenAll;
    SC.showParts();
    SC.refresh();
    SC.checkNewCircuits();
});
```

Replace with:
```javascript
window.addEventListener('DOMContentLoaded', function () {
    SC.e = CA.elementsWithId();
    SC.e.filter_show_subs.onclick = SC.refresh;
    SC.e.filter_show_done.onclick = SC.refresh;
    SC.e.plus_10_resistor.onclick = SC.plusTenAll;
    SC.e.plus_10_capacitor.onclick = SC.plusTenAll;
    SC.e.plus_10_pot.onclick = SC.plusTenAll;
    SC.e.plus_10_pot_trimmer.onclick = SC.plusTenAll;
    SC.e.plus_10_diode.onclick = SC.plusTenAll;
    SC.e.plus_10_switch.onclick = SC.plusTenAll;
    SC.showParts();
    SC.refresh();
    SC.checkNewCircuits();
});
```

- [ ] **Step 3: Full verification in browser**

Refresh `http://localhost:8080`. Expected state:

1. **Topbar**: dark, shows "What can I build", two live badges (e.g. "✓ 12 ready", "✦ 47 almost")
2. **Section 1** ("✅ What I Can Build"): circuits you have all parts for — clean rows, pill links, muted author text
3. **Section 2** ("✨ What I Could Build"): circuits missing 1–3 parts — each row shows red `.missing-chip` badges for each missing part
4. **Sidebar**: dark background, compact two-column grid, blue-tinted inputs for non-zero values
5. **Filters**: "with substitution" and "done" checkboxes work as before
6. **Parts update**: change a part count in sidebar → both sections re-render live

- [ ] **Step 4: Commit**

```bash
git add js/index.js
git commit -m "feat: split refresh into can-build and almost-build sections"
```

---

## Task 8: Push to GitHub

- [ ] **Step 1: Verify git log**

```bash
git log --oneline -8
```

Expected to see the 5 feature commits from this plan plus the prior spec commit.

- [ ] **Step 2: Push**

```bash
git push origin master
```

---

## Self-Review Checklist (pre-execution)

- [x] **Spec coverage**: dark theme ✓ · unified scroll ✓ · "almost" section ✓ · missing-chip badges ✓ · threshold ≤ 3 ✓ · two badges in topbar ✓
- [x] **No placeholders**: all steps have exact code
- [x] **Type consistency**: `SC.renderUrl(aContainer, ...)` — updated in Task 6 Step 1 and used consistently in Steps 2 & 3. `SC.renderAlmost` defined in Task 6 Step 3, called in Task 7 Step 1. `SC.e.table_almost` added to HTML in Task 5, referenced in Task 7.
- [x] **`filter_show_possible` removed**: deleted from HTML (Task 5), removed from DOMContentLoaded listener (Task 7 Step 2), not referenced in new `SC.refresh`
- [x] **`SC.e.badge_ready`, `SC.e.badge_almost`, `SC.e.count_ready`, `SC.e.count_almost`**: all added to HTML in Task 5 before being accessed in Task 7
