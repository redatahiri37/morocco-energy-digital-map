# Debugging — how to file a bug in 30 seconds

When something breaks on the live map, paste this into a chat with
Claude Code and it will invoke the `map-debugger` agent.

## Template

```
Bug: <one sentence — what I see that I shouldn't, or what I don't see that I should>

Console: <last 10-20 lines from browser DevTools, F12 → Console tab>

Screenshot: <paste or drop — optional but helpful>

URL: https://redatahiri37.github.io/morocco-energy-digital-map/
Last known-good: <commit SHA or tag like v1.2, or "don't know">
```

That's it. Three fields + a URL. The agent refuses to guess and will
ask for any missing piece before touching code.

## How to get the console output

1. Open the live site.
2. Press `F12` (or `Cmd+Opt+I` on Mac) → "Console" tab.
3. Reload the page so errors appear.
4. Right-click in the console → "Copy all messages" → paste.

Red text is what matters most. If there's no red, the bug isn't in
JS — it's rendering / data / styling.

## What counts as a bug (use this template)

- Map loads but is fully black, white, or blank
- A layer that was visible yesterday is gone today
- Bubbles drift off their coordinates when you zoom
- Tooltip stuck open / never shows / shows the wrong content
- Popup doesn't close on outside click
- Timeline slider doesn't filter features
- Numbers in the sidebar don't match the visible features
- Any JS error in the console

## What is NOT a bug (don't use this — use a feature request)

- "Could we also show X layer" → open an issue or add to `BACKLOG.md`
- "The colors don't match my preference" → design decision, discuss first
- "I want Algeria on the map" → MENA expansion, see README

## The fix loop

The debugger agent returns a report like this:

```
ROOT CAUSE: CARTO vector style fails silently in MapLibre v4.7
FIX: app.js:45 — swap vector URL for inline raster style
VERIFY: hard-refresh the live URL, basemap streets should appear in <2s
REGRESSION RISK: none; raster is a strict superset of what rendered before
```

If the VERIFY step fails when you try it, reply with the new console
output — the agent will iterate.
