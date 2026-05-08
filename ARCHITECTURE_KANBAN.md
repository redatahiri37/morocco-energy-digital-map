# Architecture Kanban — Daily Routine

## Goal

Each working day, surface **one** architecture improvement worth doing today.
Not a big refactor — a 30–90 min change that increases code clarity, data
quality, or deploy safety. Compounds over time.

## The board

Three columns: **Backlog** → **Today** → **Done**.
The whole thing lives in `ARCHITECTURE_BACKLOG.md` (markdown checklist).

Each card has:

```
- [ ] <imperative title>
  • why: <1 sentence — what problem does this solve>
  • effort: S (≤30min) / M (1–2h) / L (half-day)
  • impact: 1–5 (1 = nice-to-have, 5 = unblocks new capability)
  • files: <paths likely to change>
  • verify: <how to know it's done>
```

## The daily routine (10 minutes)

A scheduled task at **08:30 Paris time, Mon–Fri** runs an `architect` subagent:

1. **Inventory drift detection** — git log since yesterday, count features
   per GeoJSON, check for orphan files / dead imports, scan for inline data
   that should be in registry, list TODO/FIXME comments added.
2. **Score backlog cards** by `impact × urgency / effort`. Urgency increases
   for cards that block other cards (dependencies tracked in card body).
3. **Pick the top 1** card, move to "Today" column.
4. **Brief**: post a 5-line summary in the chat / a daily note —
   "today's pick + why + verification step".
5. End of day check: if "Today" card not closed, it stays; if closed,
   move to Done with the commit SHA.

## Prioritization framework

Three lenses, applied in this order:

| Lens | Question |
|---|---|
| **Foundation** | Will this break if we add a 2nd country? (Egypt next) |
| **Truth** | Does the map show what the data actually says? (data lineage, sources cited, confidence visible) |
| **Speed** | Can a new GeoJSON file be added in <5 min, end-to-end? |

A card scoring high on all three is a "5" impact. A card scoring on only
one is a "2-3".

## Pre-seeded backlog (for THIS project, today)

Cards I'd put on the board immediately:

```
Foundation
- [ ] Move src-grid line layers to a per-id source naming scheme
  • why: v1.6 has a bug — calling buildLineLayer twice clobbers src-grid.
    interconnectors and planned-corridors share the same source/layer IDs.
  • impact: 4 (silent data loss, hard to debug)
  • effort: M (1–2h)
  • files: docs/app.js (buildLineLayer)
  • verify: both interconnectors AND planned-corridors render simultaneously

- [ ] Externalize per-country layer config to JSON (not JS)
  • why: countries.config.js mixes config and code. JSON enables non-dev
    contributors and runtime overrides.
  • impact: 3
  • effort: M
  • files: docs/countries.config.js → docs/config/morocco.json + loader
  • verify: page boots identically with config loaded via fetch

- [ ] Add a /docs/data/_schema/feature.schema.json + CI validator
  • why: 6 GeoJSON files, no schema enforcement. One bad commit silently
    breaks the popup.
  • impact: 4
  • effort: M
  • files: new docs/data/_schema/, scripts/validate-geojson.py
  • verify: pre-commit hook fails when status="under_construction" sneaks in

Truth
- [ ] Show coord_confidence as a visual modifier on markers
  • why: 22 of 42 power plants are "approximate" or "centroid". User
    deserves to see which dots are exact and which are estimates.
  • impact: 4
  • effort: S
  • files: docs/app.js (buildPowerLayer paint expressions)
  • verify: hover a "centroid" plant → marker has dashed ring

- [ ] Wire source_url field to make sources clickable in detail panel
  • why: source attribution in detail panel is text-only, breaks
    auditability promise of the map.
  • impact: 3
  • effort: S
  • files: docs/app.js (renderDetailPanel)

- [ ] Add "data freshness" stamp per layer, not per app
  • why: top bar says "v1.0", but layers were last updated in different
    months. Hide the global version, surface per-layer "updated" field.
  • impact: 2
  • effort: S
  • files: docs/app.js (buildLayerList rendering)

Speed
- [ ] One-command country bootstrap script
  • why: adding Egypt today requires touching 4 files. Should be 1 cmd.
  • impact: 5 (unblocks roadmap)
  • effort: M
  • files: scripts/new-country.sh, docs/config/_template/
  • verify: ./scripts/new-country.sh egypt EG → Egypt placeholder renders

- [ ] Pre-build power-plants.geojson on commit, not at runtime
  • why: build-power-plants.py runs manually. Should run in pre-commit
    so docs/data/ is always in sync with data/energy/*.
  • impact: 3
  • effort: S
  • files: .pre-commit-config.yaml + hook script
  • verify: edit gen_solar.geojson → commit → docs/data is auto-updated

- [ ] Replace the boundary.geojson manual dissolve with a build step
  • why: scripts/build-transmission-geojson.py companion pass is referenced
    in code comments but doesn't exist in the repo.
  • impact: 2
  • effort: M

Backlog (later)
- [ ] HTTP caching headers for /data/*.geojson (Cache-Control, ETag)
- [ ] Move OIM tiles fetch behind a CORS-proof proxy (currently breaks if
      OIM rate-limits a viewer)
- [ ] Strip docs/SUBSTACK_POST.md and docs/CALC_ENGINE.md from production
      build (they ship to Pages currently)
- [ ] Migrate to Astro/Vite — only when 3rd country is added (premature now)
- [ ] Add e2e smoke test (Playwright) — load page, toggle each layer,
      assert no console errors
```

## Wiring it up (concrete next step)

Two ways to run the daily routine:

**Option A — local cron + Claude Code subagent**
- A scheduled task fires at 08:30, runs the `architect` agent in this repo
- Agent reads ARCHITECTURE_BACKLOG.md, scores it, edits "Today" column
- Posts the brief to a notes file you read with morning coffee
- Cost: ~$0.10/day (Sonnet 4.5, 10k tokens scan)

**Option B — Claude Code `/architect` slash command**
- Manual trigger from inside Claude Code: you type `/architect` once a day
- Same agent logic but on-demand
- No scheduling needed, no cost when idle

Recommend **Option B** until the routine proves valuable, then graduate
to A. I can scaffold the slash command on request.

## Done log

Move closed cards here with their commit SHA + date:

```
- [x] 2026-05-04 — Hybrid v1.6 + AI Atlas data merge (eea69e4 → 9525676)
- [x] 2026-05-03 — Wire real ONEE grid (947 features) (0f19a8b)
- [x] 2026-05-03 — Expand generation 16→42 features (a57bd5c)
```
