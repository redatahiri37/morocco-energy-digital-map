# Energy × Digital Nexus — Morocco Infrastructure Map

Interactive multi-layer map of Morocco's electricity generation,
transmission grid, industrial load and data-center pipeline.

v1.0 · Morocco only. Structured to scale to MENA by dropping one
GeoJSON folder and one config entry per country.

---

## Layers (v1.0)

| # | Layer | Type | Source |
|---|---|---|---|
| 1 | Power generation | points | Global Energy Monitor · ONEE · MASEN |
| 2 | Transmission grid | lines (400 / 225 / 60 kV + HVDC planned) | OSM · ONEE |
| 3 | Industrial consumers | points | OCP · Holcim · SONASID · operator disclosures |
| 4 | Digital infrastructure | points | Datacentermap.com · OSM · DCD · press |
| 5 | Renewable potential | **deferred to v1.1** | Global Solar Atlas · Global Wind Atlas | EU Commission PHOTOVOLTAIC GEOGRAPHICAL INFORMATION SYSTEM | 

All source URLs are in [DATA_SOURCES.md](./DATA_SOURCES.md). Every
feature carries a `source` and `source_url` property so provenance is
inspectable from the map tooltip.

## Quick start — run locally

This is a static site. **No token, no account, no signup.** The basemap
uses MapLibre GL + CARTO dark-matter / positron + OpenStreetMap tiles
— all public.

```bash
cd docs
python3 -m http.server 8000
# open http://localhost:8000
```

That's it.

> **v1.1 note** — the app used to require a Mapbox token. It no longer
> does. `config.js` is kept only for future per-country overrides; you
> can safely leave `docs/config.example.js` as-is or delete it.

## Reporting a bug

See [DEBUGGING.md](./DEBUGGING.md) — paste a 4-field template and the
`map-debugger` agent triages it.

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
