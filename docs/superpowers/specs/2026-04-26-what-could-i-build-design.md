# Design: "What Could I Build" + Modern Dark UI

**Date:** 2026-04-26  
**Status:** Approved

---

## Summary

Add a "What Could I Build" section to `index.html` and redesign the entire UI with a modern dark theme. The new section surfaces circuits the user is *almost* able to build — missing at most 3 parts — sorted by fewest missing parts first.

---

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Structure | Unified scroll on `index.html` | Most immersive; no page switching needed |
| Threshold | Missing ≤ 3 parts | Balanced — actionable without being overwhelming |
| Theme | Dark | User preference |
| "+ add to list" | Not in scope | YAGNI; can add later |
| Threshold toggle | Not in scope | Fixed ≤ 3 keeps UI simple |

---

## Architecture

This is a pure static HTML/JS/CSS project — no build step, no framework. All changes stay in the existing files.

### Files changed

| File | Change |
|---|---|
| `index.html` | Add "almost" section markup below existing table; update topbar with dual badge |
| `css/index.css` | Full dark theme redesign |
| `css/sidebar.css` | Dark sidebar redesign |
| `css/table.css` | Dark table styles + new `.almost-row` and `.missing-chip` classes |
| `css/mobile.css` | Update mobile breakpoints for dark theme |
| `js/index.js` | Drive two separate table bodies (`table_ok` for ready, `table_almost` for almost) |
| `js/filter.js` | No change — `errors` count already exists |
| `js/render.js` | Add `SC.renderAlmost()` that renders missing-part chips on each row |

### No new files needed — extend existing structure.

---

## Data Flow

```
SC.filter() → result[]  (already sorted by errors.length asc)
                │
                ├─ errors.length === 0  →  table_ok    (What I Can Build)
                └─ errors.length 1–3   →  table_almost (What I Could Build)
```

`filter.js` already produces `errors[]` per circuit (the list of missing part strings) and sorts by fewest errors ascending. No logic change needed — just split the render output.

---

## UI Design

### Layout
- **Sidebar** (220px, fixed left): dark `#0d1117`, compact parts grid, blue-tinted inputs for non-zero values
- **Main** (flex-1, scrollable): sticky topbar → "Can Build" section → divider → "Could Build" section

### Topbar
- Title: "What can I build"
- Two badges: `✓ N ready` (green) and `✦ N almost` (indigo)
- Existing filter checkboxes (possible / with substitution / done) — retained

### "What I Can Build" section
- Green accent (`#4ade80`)
- Existing table columns: Links | Circuit | Parts | Action
- Rows: dark `#060b14` base, subtle hover

### "What I Could Build" section
- Indigo accent (`#818cf8`)
- Same table structure
- Each row has a `missing-parts` div below the circuit name showing red chips: `− 10u cap`, `− LM741`, etc.
- Chips styled: `background #1c0f0f`, `border #7f1d1d`, `color #f87171`

### Color tokens
| Token | Value | Use |
|---|---|---|
| `--bg` | `#060b14` | Page background |
| `--surface` | `#0d1117` | Sidebar, sticky bars |
| `--border` | `#1e2d3d` | All borders |
| `--text` | `#e2e8f0` | Primary text |
| `--muted` | `#475569` | Labels, counts |
| `--green` | `#4ade80` | "Can build" accent |
| `--indigo` | `#818cf8` | "Could build" accent |
| `--red-chip-bg` | `#1c0f0f` | Missing part chip background |
| `--red-chip-border` | `#7f1d1d` | Missing part chip border |
| `--red-chip-text` | `#f87171` | Missing part chip text |

---

## Component Breakdown

### `SC.renderAlmost(key, circuit, errors, warnings)` (new in `render.js`)
- Identical to `SC.renderOne()` except:
  - Appends a `div.missing-parts` after the circuit name containing one `span.missing-chip` per error string
  - Row gets class `almost-row` for background tinting

### `SC.refresh()` changes (`index.js`)
- Populates `table_almost` tbody in addition to `table_ok`
- Circuits with `errors.length >= 1 && errors.length <= 3` go to `table_almost`
- `total_count` badge updates both counts: `can` (errors=0) and `almost` (errors 1–3)
- "nothing" message only shown if both sections are empty

---

## What's Out of Scope

- Shopping list / "add to list" functionality
- Adjustable threshold slider
- Any backend or persistence changes (parts counts already saved to localStorage)
- Changes to `search.html`, `simplest.html`, `stats.html`, `api_demo.html`
