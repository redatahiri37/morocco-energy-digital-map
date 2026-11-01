# Wattu — Morocco residential PV estimator

Two-step web tool: user enters an address → gets instant production + ROI estimate → refines with sliders. Static site, no backend runtime.

**Live: https://solar.wattu.org** (Pages default: atlas-solar.pages.dev)

## Deployment independence

This tool is **infrastructurally independent** from the Wattu
infrastructure map, even though both live in this repo:

| | Solar tool | Infrastructure map |
|---|---|---|
| Source | `solar/` | `docs/` |
| Pages project | `atlas-solar` | `atlas-nexus` |
| URL | solar.wattu.org | energy.wattu.org |
| Deploy | `wrangler pages deploy solar --project-name=atlas-solar` | automatic on push to `main` (GitHub Actions) |

A broken deploy on one **cannot** take the other down. They share no CSS
(`brand.css` is duplicated deliberately, not imported across the boundary),
no JS, and no sitemap. The only shared infrastructure is the `solar-pvgis`
Worker (it also serves the map's live Spain–Morocco flow), the Cloudflare
account, and DNS.

The map links to this tool and vice versa, but only by absolute URL. The old
`/solar/` path on the map's domain 301-redirects here via `docs/_redirects`.

**If you are changing this tool, you never need to touch `docs/`.**

## Architecture

```
solar/          (repo root — its own Cloudflare Pages project)
├── index.html       Page shell — two <section class="step"> views
├── style.css        Wattu brand (navy #001F4D / orange #FF6B35)
├── engine.js        The figures: CONFIG, PV, Tariff, ROI, Finance, Sizing (shared with the city pages and the chat)
├── app.js           The simulator: Geocoder, PVGIS, Chart_, Roof, MapView, UI
├── analytics.js     Cookieless usage beacon (see ANALYTICS.md)
├── chat/            Chat assistant page (prototype, private link)
├── proxy/           Cloudflare Worker: PVGIS proxy, /e, /csp, /chat
├── pages.css        Style of the generated city pages
├── data/cities.json Cities that get a page under /ville/<slug>/, and the list
│                    offered when an address is not found (deployed as is)
└── README.md
```

### Languages

The simulator is written once, in French (`index.html`, `app.js`). At deploy,
`scripts/build-solar-i18n.mjs` writes `/ar/` (Moroccan Arabic, right to left)
and `/en/` from `index.html` and the table in `i18n/simulator.mjs`; `app.js`
picks its own texts from its `I18N` table by `<html lang>`. Change a French
text in `index.html` and the build stops until its translation follows
(the PR check runs the same script). Arabic register: Darija for headings,
buttons and questions, plain Arabic for explanations.

### City pages (search engines and AI assistants)

The estimator computes everything in the browser after an address is typed,
so crawlers see none of it. At deploy, `scripts/build-solar-cities.mjs`
writes static HTML with the same figures:

- `/ville/<slug>/` — one page per city in `data/cities.json`: yield per kWc,
  savings and payback for four bills, monthly production, FAQ, method.
- `/villes/` — all cities ranked, linked from the page footer.
- `/ar/ville/<slug>/`, `/ar/villes/` (Moroccan Arabic: Darija headings and
  questions, right to left) and `/en/city/<slug>/`, `/en/cities/` (English) —
  the same pages, all three languages `hreflang`-linked. Names: `name_ar`,
  `region_ar`, `name_en` in `data/cities.json`.
- `/guide/<slug>/` — answers to the questions people search for: how many
  panels for a bill, installed price, ONEE tariff, law 82-21, Taqa Pro. Figures
  from the same engine and PVGIS runs (median city); facts from "Data sources"
  below and `INSTALLERS.md`. `/guide/` lists them.
  The same guides in Arabic (`/ar/guide/<slug>/`, Darija headings and
  questions) and English (`/en/guide/<english-slug>/`), `hreflang`-linked.
- `/sitemap.xml` and `/llms.txt` — generated with them (no sitemap in the repo).
- `/data/barometre-solaire-maroc.csv` — the figures behind the city pages,
  one row per city (PVGIS output by month, then sizing, cost, savings and
  payback for four bills), CC BY 4.0, linked from the three city indexes
  and declared as the Dataset's download.
- `/og/<lang>/<slug>.png` and `/og/<lang>/home.png` — 1200×630 share images
  (og:image, twitter:image) with each city's figures. The build writes the
  cards as HTML (`--og-src`); `scripts/render-og.mjs` renders them with the
  runner's Chrome over the DevTools pipe (no npm package).
- IndexNow: after each deploy, `scripts/indexnow-ping.mjs` submits every
  sitemap URL to Bing and the other IndexNow engines. The key in
  `indexnow-key.txt` is public by design (served at `/<key>.txt`); a failed
  ping never fails the deploy.

Figures come from PVGIS at each city centre and the estimator's own engine
(`engine.js`, the file the simulator loads), so a page and the tool
always agree: change a tariff in `CONFIG` and the pages follow on the next
deploy. If PVGIS fails, the deploy stops and the live pages stay as they
were. To add a city, add a line to `data/cities.json`. Local preview
without network: `node scripts/build-solar-cities.mjs /tmp/out --offline`
(approximate yields, pages marked noindex).

### External dependencies (all CDN, no build step, no tokens)
- **Leaflet 1.9.4** — mini-map
- **Chart.js 4.4.1** — monthly production + 25-yr cashflow
- **MapLibre GL 4.7.1** — the « Voir en 3D » view of the roof, loaded only on
  that click (`vendor/maplibre-gl-4.7.1`, the energy map's copy; hashes in
  `CONFIG.MAPLIBRE_*`, checked by CI)
- **Esri World Imagery** — default basemap, zoomed on the roof (token-free, not open data); OpenStreetMap tiles as the other layer (ODbL).
- **Nominatim** — address geocoding (`countrycodes=ma`, French locale)
- **Overpass API** — building footprint around the address

These services see the visitor's IP with the address (Nominatim) or the
house location (Overpass, Esri tiles, PVGIS via the Worker). The page footer
says so. The share link carries the address (`n`); the hash written while
browsing does not.
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
- **Relays** the live Spain–Morocco interconnector flow for the energy map on `GET /flow/es-ma` ([`proxy/flow.js`](proxy/flow.js)): REE's 5-minute data from `demanda.ree.es` (JSONP, no CORS, no account), reduced to `{ at, net_import_mw }`, edge-cached 5 min. If REE stops answering, the map's tile shows "Unavailable right now"; nothing else depends on it.
- **Collects** usage events on `POST /e` ([`ANALYTICS.md`](ANALYTICS.md)) and Content-Security-Policy violation reports on `POST /csp` ([`SECURITY.md`](../SECURITY.md) › Reading the CSP reports), each kept only in the expected shape.
- **Scopes CORS** to the Wattu origins (`ALLOWED_ORIGINS` in `proxy/worker.js`: solar.wattu.org, energy.wattu.org and the Pages addresses; no localhost, so a local copy of the page shows the approximate mode unless it points at `wrangler dev`).

The client calls only the Worker (`CONFIG.PVGIS_WORKER_URL`); there is no third-party CORS proxy.

### Proxy operations

First-time setup (Cloudflare account via GitHub OAuth, no card needed):

```bash
npm install -g wrangler
wrangler login
```

Deploy: automatic. `.github/workflows/worker.yml` runs the Worker tests and
deploys on every change to `solar/proxy/` on `main`; Actions › worker-deploy ›
Run workflow redeploys it by hand. Without CI (from `solar/proxy/`):

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

## Chat assistant (prototype)

`chat/` is a page where a visitor asks questions in French, Darija or
English. It is free to run: the Worker's `POST /chat` (`proxy/chat.js`)
uses an open model on **Cloudflare Workers AI** (the `AI` binding, inside
the Workers Free plan's daily allowance: no card, no API key). For each
question it:

1. reads the city (one of `data/cities.json`, in French, Arabic or
   English, Darija prefixes such as فـ / بـ included) and the monthly bill
   in dirhams or kWh, with plain rules, anywhere in the conversation;
2. when both are there, computes the estimate with `engine.js` and PVGIS,
   exactly as the simulator does, and sends it to the page as a card with
   a link that opens the simulator on those values;
3. asks the model to write the reply around those figures only (or to ask
   for what is missing).

The model never computes a figure. When the daily allowance is used up,
an estimate is still answered with a fixed sentence in the visitor's
language; other questions get « limit reached, use the simulator ».
Nothing is stored: the page keeps the conversation in memory and sends it
with each question (10 exchanges at most).

**Switch it on** (once): the `[ai]` binding is in `wrangler.toml`; set the
access key and open the page.

```bash
KEY=$(openssl rand -hex 24); echo "$KEY"
echo "$KEY" | npx wrangler@4 secret put CHAT_ACCESS_KEY --name solar-pvgis
```

Then open `https://solar.wattu.org/chat/#k=<CHAT_ACCESS_KEY>` (add `&l=ar`
or `&l=en` for another language). The browser keeps the key and removes
it from the address bar. Without the key, `/chat` answers 503.

- **Model**: `@cf/meta/llama-4-scout-17b-16e-instruct` by default
  (`DEFAULT_MODEL` in `proxy/chat.js`). Another Workers AI text model:
  `[vars] CHAT_MODEL = "@cf/…"` in `wrangler.toml`. Darija is the weak
  spot of every open model: have a native speaker try it.
- **Cost**: none. The free allowance (10,000 neurons a day, shared by all
  Workers AI use on the account) resets at midnight UTC.
- **Limits**: 10 answers a minute per IP (`CHAT_LIMITER`), one model call
  per answer, 1,500 characters per question.
- **Logs**: `wrangler tail solar-pvgis` shows each answer's model and token
  usage, or why the model failed (quota), never the text.
- **Tests**: `node chat.test.mjs` in `proxy/`, with a fake AI binding.

## Long-term architecture

This module is a template for future single-purpose tools under Wattu:

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

- **3D view** (« Voir en 3D » on the roof map): the footprint extruded to
  storeys × 3 m (OSM `building:levels` or `height`, else 2 storeys, which
  the visitor can change), the proposed panels tilted on 0.3 m frames, and
  the shadows they cast on the roof for 21 Dec / 21 Mar / 21 Jun at a chosen
  solar hour (Cooper's declination; shadows clipped to the roof's convex
  hull). MapLibre extrudes flat prisms only, so a tilted panel is a stair
  of 10 strips. An illustration: roof obstacles and the neighbours'
  shadows are unknown, and the page says so. It changes no figure.

- **PVGIS** uses PVGIS-SARAH3 radiation DB (satellite-derived, 5×5 km, 1990–2020 climatology). Systematic bias typically ±5% for MA.
- **Self-consumption ratio** is heuristic: `0.30 + 0.55·exp(-0.9·(prod/cons))`. At sizing ratio 1.0 → ~55%; at 2.0 → ~33%. Real values depend on load profile — should be a per-user input in a future version.
- **Cashflow** uses 0.5%/yr degradation, 2%/yr tariff inflation, 1% opex, 5% discount, 25-yr life. All in `CONFIG` — swap freely.

## Known limitations

- Nominatim rate limit (1 req/s) can bite on aggressive typing. Debounced 300 ms; consider Photon or a Cloudflare-cached geocoder if traffic grows.
- Self-consumption ratio is a rough model; not validated against measured MA household load curves.
- Export revenue is a rough upper bound — LV residential feed-in tariff not yet officially published.
- No sensitivity view yet (single-point estimates only). Add tornado chart when needed.
