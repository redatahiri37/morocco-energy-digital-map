# Lovable Prompt — Morocco Energy × Digital Infrastructure Map

> Paste the section between the markers into Lovable.

---

--- START PROMPT ---

Build a single-page web app that visualizes Morocco's infrastructure on an interactive map.

**What it shows**, as four toggleable map layers:
1. **Power plants** — solar, wind, hydro, gas, coal (one icon color per tech).
2. **Grid** — HV transmission lines and substations.
3. **Heavy industry** — phosphate mines (OCP), cement plants, steel plants.
4. **Digital infrastructure** — data centers, submarine cable landing stations.

**That's it.** No login, no blog, no marketing page. Visitors land on the map.

**How it should feel**
Clean and minimal, in the spirit of [enersite.app](https://enersite.app) and [electricitymaps.com](https://app.electricitymaps.com). Dark theme by default. The map fills the screen; chrome is light.

**UI**
- A small top bar with the project name on the left.
- A simple legend / layer toggle panel on the left or as a floating card. Each layer has a checkbox and a color chip.
- On hover over a feature, show a small tooltip with: name, type, and one key number (e.g. capacity in MW for plants, MW for industrial sites, sq m or MW IT for data centers).
- A discreet footer with data source credits.

**Tech**
- React + Vite + TypeScript, Tailwind, Mapbox GL JS, Mapbox dark style.
- Mapbox token from `VITE_MAPBOX_TOKEN`.
- Data is loaded from GeoJSON files in `/public/data/` — scaffold them with 3–5 placeholder points per layer so the map isn't empty. Mark placeholder data with `"source": "placeholder"` in the feature properties.
- Map starts centered on Morocco at roughly zoom 5.5.
- No backend, deployable to Vercel.

Make it look like a serious tool a researcher or a hyperscaler analyst would actually open. Not like a startup landing page.

--- END PROMPT ---
