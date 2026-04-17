# Energy × Digital Nexus — Morocco Infrastructure Map

Interactive multi-layer map of Morocco's electricity generation,
transmission grid, industrial load and data-center pipeline.

v1.0 · Morocco only. Structured to scale to MENA by dropping one
GeoJSON folder and one config entry per country.

> Inspired by [Pawel Czyzak's Data Center Siting Tool](https://paczyzak.substack.com/p/data-centers)
> (transparency-first UX) and [enersite.app](https://www.enersite.app/)
> (multi-layer spatial analysis).

---

## Layers (v1.0)

| # | Layer | Type | Source |
|---|---|---|---|
| 1 | Power generation | points | Global Energy Monitor · ONEE · MASEN |
| 2 | Transmission grid | lines (400 / 225 / 60 kV + HVDC planned) | OSM · ONEE |
| 3 | Industrial consumers | points | OCP · Holcim · SONASID · operator disclosures |
| 4 | Digital infrastructure | points | Datacentermap.com · OSM · DCD · press |
| 5 | Renewable potential | **deferred to v1.1** | Global Solar Atlas · Global Wind Atlas |

All source URLs are in [DATA_SOURCES.md](./DATA_SOURCES.md). Every
feature carries a `source` and `source_url` property so provenance is
inspectable from the map tooltip.

## Quick start — run locally

This is a static site. Any HTTP server works.

```bash
# 1. Get a Mapbox token
#    → https://account.mapbox.com/access-tokens

# 2. Copy the config template and paste your token
cp docs/config.example.js docs/config.js
#   then edit docs/config.js:  mapboxToken: "pk.…"

# 3. Serve the docs/ folder
cd docs
python3 -m http.server 8000
#   open http://localhost:8000
```

If you don't want to create a `config.js`, the page accepts a token
at runtime — the "Map engine unavailable" card has a field that stores
the token in `localStorage`.

> **Token is domain-restricted in production.** If you clone this repo
> and try to run it under your own URL, you must use your own Mapbox
> token. The production token is restricted to the deployed GitHub
> Pages URL only.

## Project structure

```
morocco-map/
├── docs/                          ← GitHub Pages root (main branch, /docs)
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── config.example.js          ← committed template
│   ├── config.js                  ← your token — gitignored
│   ├── countries.config.js        ← add a country here
│   └── data/
│       └── morocco/
│           ├── power-plants.geojson
│           ├── grid-lines.geojson
│           ├── industrial.geojson
│           └── digital.geojson
├── .gitignore
├── ASSUMPTIONS.md                 ← what was assumed, what is approximate
├── DATA_SOURCES.md                ← every source, URL, license
└── README.md
```

## How to contribute data

1. Fork the repo.
2. Edit the relevant GeoJSON in `docs/data/morocco/`.
3. Every feature must carry a `source`, `source_url`, `precision`
   (`exact` or `approximate`), and an `updated` date in
   `countries.config.js`.
4. **Unsourced edits will be closed.** Provide a public URL.
5. Open a PR. Describe what you changed and why.

### Adding a country (MENA expansion)

```js
// docs/countries.config.js
window.COUNTRIES = {
  morocco: { /* … */ },
  egypt: {
    label: "Egypt", iso: "EG",
    center: [30.8, 26.8], zoom: 5.2,
    dataPath: "./data/egypt/",
    layers: [ /* same shape as morocco.layers */ ]
  }
};
window.COUNTRIES_ENABLED = ["morocco", "egypt"];
```

Drop the four GeoJSONs into `docs/data/egypt/`. No JS or CSS change
required — the app reads the manifest at boot.

## Security — token hygiene

- `docs/config.js` is in `.gitignore`. **Verify** before pushing:
  ```bash
  git status    # config.js must NOT appear
  ```
- If you accidentally commit a token: rotate it immediately in the
  [Mapbox dashboard](https://account.mapbox.com/access-tokens).
- In production, restrict the token to the GitHub Pages URL:
  *Mapbox dashboard → Tokens → URL restrictions → add your Pages URL.*

## Definition of Done — v1.0

- [x] Four layers, toggle independently
- [x] Hover tooltip on every feature (name, metric, source link)
- [x] Click popup with stats, status, raw JSON, "Report an error" mailto
- [x] Methodology panel + known-gaps panel (transparency-first)
- [x] Bottom bar with source attribution + GitHub link
- [x] Mobile responsive down to 375 px
- [x] `DATA_SOURCES.md` lists every source
- [x] `config.js` gitignored
- [ ] Token domain-restricted in Mapbox dashboard *(manual step after deploy)*
- [ ] Live on GitHub Pages *(manual step — owner-driven)*

## v1.1 backlog

See bottom of [ASSUMPTIONS.md](./ASSUMPTIONS.md).

- Data-fetch scripts (`tools/fetch_gem.py`, `tools/fetch_overpass.sh`)
- Layer 5 — renewable potential raster
- MapLibre + OpenFreeMap engine fallback
- Grid-suitability index (Pawel-style 1–5 score for DC siting)
- Egypt / Senegal / Namibia

## Credits

Built by **Reda Tahiri** — Energy × Digital Nexus.
Not affiliated with any of the operators, ministries, or consultancies
referenced in the data. All opinions are the author's.

## License

Code: MIT.
Data: aggregated from public sources — see `DATA_SOURCES.md` for the
license of each upstream dataset. OpenStreetMap-derived data is under
ODbL 1.0 and must retain attribution on redistribution.
