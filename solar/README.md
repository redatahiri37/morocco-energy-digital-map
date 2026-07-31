# Atlas Solar — Morocco residential PV estimator

Two-step web tool: user enters an address → gets instant production + ROI estimate → refines with sliders. Static site, no backend runtime, deploys with the rest of Atlas Nexus.

Live: https://redatahiri37.github.io/morocco-energy-digital-map/solar/

## Architecture

```
solar/
├── index.html       Page shell — two <section class="step"> views
├── style.css        Atlas Nexus brand (navy #001F4D / orange #FF6B35)
├── app.js           All logic, modular namespaces (CONFIG, Geocoder, PVGIS, Tariff, ROI, Chart_, MapView, UI)
└── README.md
```

### External dependencies (all CDN, no build step)
- **Leaflet 1.9.4** — mini-map
- **Chart.js 4.4.1** — monthly production + 25-yr cashflow
- **OpenStreetMap tiles** — Leaflet basemap
- **Nominatim** — address geocoding (`countrycodes=ma`, French locale)
- **PVGIS v5.2** (EU JRC) — annual + monthly kWh per (lat, lon, kWp, tilt, azimuth)

### Data sources
- **ONEE stepped tariff** (2025, TTC) — hardcoded in `CONFIG.ONEE_TRANCHES`. Source: [kherba.com/tarifs](https://kherba.com/tarifs).
- **Grid CO₂ factor** — 0.71 kg/kWh, ONEE 2024 mix.
- **Installed cost** — 8–15 MAD/Wc range, 11 MAD/Wc central. Source: [lechantier.ma](https://lechantier.ma/en/prix/solaire), May 2026.
- **Law 82-21** — décret n° 2.25.100 (5 mars 2026). Surplus injection capped at 20% of annual production; feed-in ~0.18 MAD/kWh (MV off-peak, upper bound for LV pending official publication).

## PVGIS proxy — TODO

PVGIS explicitly rejects browser AJAX (no CORS headers). The current v1 routes calls through `corsproxy.io`, which is fine for a demo but not durable:
- Public rate limits, no SLA
- Third-party sees every user's coordinates
- Could disappear or throttle at any time

**Migration path (~15 min):** deploy a Cloudflare Worker as a dedicated PVGIS proxy.

```javascript
// solar-pvgis-proxy Worker
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/pvcalc") {
      return new Response("Not found", { status: 404 });
    }
    const upstream = new URL("https://re.jrc.ec.europa.eu/api/v5_2/PVcalc");
    for (const [k, v] of url.searchParams) upstream.searchParams.set(k, v);
    const r = await fetch(upstream, { cf: { cacheTtl: 3600, cacheEverything: true } });
    return new Response(r.body, {
      status: r.status,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "https://redatahiri37.github.io",
        "cache-control": "public, max-age=3600",
      },
    });
  },
};
```

Then in `app.js`:
```javascript
PVGIS_ORIGIN: "https://solar-pvgis.<your-subdomain>.workers.dev/pvcalc",
PVGIS_PROXY: "",   // no external proxy needed
```

Cloudflare free tier = 100k requests/day, ample for this. Edge caching by (lat,lon,params) tuple cuts JRC hits ~90%.

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
