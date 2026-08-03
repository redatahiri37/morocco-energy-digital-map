# Atlas Solar — Morocco residential PV estimator

Two-step web tool: user enters an address → gets instant production + ROI estimate → refines with sliders. Static site, no backend runtime.

**Live: https://atlas-solar.pages.dev**

## Deployment independence

This tool is **infrastructurally independent** from the Atlas Nexus
infrastructure map, even though both live in this repo:

| | Atlas Solar | Infrastructure map |
|---|---|---|
| Source | `solar/` | `docs/` |
| Pages project | `atlas-solar` | `atlas-nexus` |
| URL | atlas-solar.pages.dev | atlas-nexus-69o.pages.dev |
| Deploy | `wrangler pages deploy solar --project-name=atlas-solar` | `wrangler pages deploy docs --project-name=atlas-nexus` |

A broken deploy on one **cannot** take the other down. They share no CSS
(`brand.css` is duplicated deliberately, not imported across the boundary),
no JS, and no sitemap. The only shared infrastructure is the `solar-pvgis`
Worker, the Cloudflare account, and DNS.

The map links to this tool and vice versa, but only by absolute URL. The old
`/solar/` path on the map's domain 301-redirects here via `docs/_redirects`.

**If you are changing this tool, you never need to touch `docs/`.**

## Architecture

```
solar/          (repo root — its own Cloudflare Pages project)
├── index.html       Page shell — two <section class="step"> views
├── style.css        Atlas Nexus brand (navy #001F4D / orange #FF6B35)
├── app.js           All logic, modular namespaces (CONFIG, Geocoder, PVGIS, Tariff, ROI, Chart_, MapView, UI)
└── README.md
```

### External dependencies (all CDN, no build step, no tokens)
- **Leaflet 1.9.4** — mini-map
- **Chart.js 4.4.1** — monthly production + 25-yr cashflow
- **OpenStreetMap tiles** — default basemap (open data, ODbL). Esri World Imagery available as an optional satellite toggle (token-free, not open data).
- **Nominatim** — address geocoding (`countrycodes=ma`, French locale)
- **PVGIS v5.2** (EU JRC) — annual + monthly kWh per (lat, lon, kWp, tilt, azimuth), via our Cloudflare Worker proxy

### Data sources
- **ONEE stepped tariff** (2025, TTC) — hardcoded in `CONFIG.ONEE_TRANCHES`. Source: [kherba.com/tarifs](https://kherba.com/tarifs).
- **Grid CO₂ factor** — 0.71 kg/kWh, ONEE 2024 mix.
- **Installed cost** — 8–15 MAD/Wc range, 11 MAD/Wc central. Source: [lechantier.ma](https://lechantier.ma/en/prix/solaire), May 2026.
- **Law 82-21** — décret n° 2.25.100 (5 mars 2026). Surplus injection capped at 20% of annual production; feed-in ~0.18 MAD/kWh (MV off-peak, upper bound for LV pending official publication).

## PVGIS proxy — Cloudflare Worker

PVGIS explicitly rejects browser AJAX (no CORS headers), so all calls route through a dedicated Cloudflare Worker. Source lives in [`proxy/worker.js`](proxy/worker.js), config in [`proxy/wrangler.toml`](proxy/wrangler.toml).

What the Worker does:
- **Whitelists** query params and bounds-checks them (lat/lon/kWp/tilt/azimuth) — rejects anything else with a French 400.
- **Edge-caches** JRC responses 24 h, keyed on the sorted param tuple. Repeat lookups never hit JRC.
- **Rate-limits** 60 req/min/IP (degrades gracefully if the beta binding is unavailable).
- **Maps errors** to `{ "error": "<message fr>", "status": <code> }` — the client shows the message inline.
- **Scopes CORS** to `https://redatahiri37.github.io` and `http://localhost:8765`.

Until the Worker URL is pasted into `CONFIG.PVGIS_WORKER_URL` in `app.js`, the client falls back to the `corsproxy.io` shim so the page keeps working pre-deploy.

### Proxy operations

First-time setup (Cloudflare account via GitHub OAuth, no card needed):

```bash
npm install -g wrangler
wrangler login
```

Deploy (from `solar/proxy/`):

```bash
cd solar/proxy && wrangler deploy
```

The deploy output prints the live URL. Currently deployed at
**`https://solar-pvgis.redatahiri.workers.dev/pvcalc`** — already wired into
`CONFIG.PVGIS_WORKER_URL` in `app.js`. Redeploys keep the same URL.

- **Logs (live):** `wrangler tail` from `solar/proxy/`
- **Verify cache:** `curl -sI "<worker-url>/pvcalc?lat=33.57&lon=-7.59&peakpower=3&angle=30&aspect=0"` twice — second response has `cf-cache-status: HIT`
- **Rename/rotate subdomain:** change `name` in `wrangler.toml`, redeploy, update `CONFIG.PVGIS_WORKER_URL`
- **If deploy rejects the rate-limit binding** (open beta): delete the `[[unsafe.bindings]]` block in `wrangler.toml` and redeploy — the worker runs without rate limiting.

## Long-term architecture

This module is a template for future single-purpose tools under Atlas Nexus:

```
/                    → main map (existing)
/solar/              → residential PV estimator          ← this module
/battery/  (future)  → residential BESS sizing
/ev/       (future)  → EV charging cost calculator
/roi/      (future)  → industrial solar/wind ROI
```

Each tool is a self-contained folder under repo root — no shared build, no framework coupling, deploys via the existing GitHub Pages setup. Shared brand comes from consistent CSS variables (`--navy`, `--orange`, `--cyan`) copied per-tool.

If any tool grows beyond ~500 LOC, split `app.js` into ES modules and add a lightweight bundler (esbuild). Not now.

## Model notes

- **PVGIS** uses PVGIS-SARAH3 radiation DB (satellite-derived, 5×5 km, 1990–2020 climatology). Systematic bias typically ±5% for MA.
- **Self-consumption ratio** is heuristic: `0.30 + 0.55·exp(-0.9·(prod/cons))`. At sizing ratio 1.0 → ~55%; at 2.0 → ~33%. Real values depend on load profile — should be a per-user input in a future version.
- **Cashflow** uses 0.5%/yr degradation, 2%/yr tariff inflation, 1% opex, 5% discount, 25-yr life. All in `CONFIG` — swap freely.

## Known limitations

- Nominatim rate limit (1 req/s) can bite on aggressive typing. Debounced 300 ms; consider Photon or a Cloudflare-cached geocoder if traffic grows.
- Self-consumption ratio is a rough model; not validated against measured MA household load curves.
- Export revenue is a rough upper bound — LV residential feed-in tariff not yet officially published.
- No sensitivity view yet (single-point estimates only). Add tornado chart when needed.
