# Mapping Morocco's energy–digital nexus, one GeoJSON at a time

*A public, open-source map of where Morocco's electricity is produced,
moved, and consumed — and where the data centers are trying to land.*

---

**Live map → [redatahiri37.github.io/morocco-energy-digital-map](https://redatahiri37.github.io/morocco-energy-digital-map/)**
**Source → [github.com/redatahiri37/morocco-energy-digital-map](https://github.com/redatahiri37/morocco-energy-digital-map)**

---

## Why I built this

For the last year I've been trying to answer a question that seems
simple and isn't: *where, physically, can Morocco put its next
gigawatt of data-center load?*

The answer turns on four things that are almost never shown on the
same map: **where power is generated, how it moves on the
transmission grid, which industrial sites already consume large
blocks of it, and where the hyperscaler pipeline is targeting.**
Ministry briefings show you one layer at a time. Consultancy decks
show you a pretty chart. Nobody shows the four together.

So I built it. It's free. It runs in the browser. It has no login,
no token, no paywall, and every single feature on the map carries a
`source` and a URL you can click to verify me.

## What's on it (v1.1)

Four data layers, each a static GeoJSON you can inspect:

1. **Power generation** — 40-plus plants. Solar (Noor, MASEN),
   wind (Tarfaya, Midelt), hydro, gas, coal. Announced / under
   construction / operational each rendered distinctly.
2. **Transmission grid** — 400 kV backbone, 225 kV regional rings,
   60 kV feeders, the planned Dakhla → Agadir HVDC corridor, the
   two existing Spain–Morocco submarine interconnectors, the idle
   Algeria–Morocco link, and the proposed Xlinks UK–MA HVDC.
3. **Industrial consumers** — OCP (phosphate), Jorf Lasfar cluster,
   cement (LafargeHolcim, Ciments du Maroc), steel (SONASID, Maghreb
   Steel), auto (Renault Tanger, Stellantis Kénitra), mining
   (Managem). Each with an `estimated_demand_mw` tagged as approximate.
4. **Digital infrastructure** — live data centers (N+ONE, inwi, Maroc
   Telecom), the Rabat Technopolis government DC, the announced
   hyperscale projects (Iozera, Naver × Nvidia, Dakhla Sovereign),
   plus the submarine cable landings at Casablanca (2Africa) and
   Agadir (ACE).

Planned / announced projects are drawn at reduced opacity with a
dashed outline — so you can see the pipeline without confusing it
with energised capacity. Data-center bubbles scale with announced
capacity. Hover for a tooltip, click for the full card with raw
JSON and a "Report an error" link.

## The design principle: transparency > polish

The map is explicitly modelled on
[Pawel Czyzak's Data Center Siting Tool](https://paczyzak.substack.com/p/data-centers)
and [enersite.app](https://www.enersite.app/). The rule I borrowed
from them and refuse to break:

> **Every feature on the map must carry a source URL a non-expert
> can click to verify.**

No feature without a source. No source without a public link. Where
a figure is estimated from press rather than measured, the feature
carries `precision: "approximate"` and the card says so. The
methodology panel lists every upstream dataset. The README enforces
the same rule for contributions — unsourced edits get closed.

## What the v1.1 map already tells us

A few things jump out once you put the four layers on the same canvas:

- **The announced DC pipeline (≈1.4 GW) is structurally concentrated on
  the Casablanca–Rabat–Tangier coastal axis** — exactly where the
  400 kV backbone already is, and exactly where the grid is already
  most loaded by industrial demand.
- **The Dakhla–Agadir HVDC corridor matters more than it looks.**
  Without it, the southern solar/wind buildout cannot reach the
  northern load. The Xlinks project only works *through* it.
- **The Algeria–Morocco link is still on the map, but dashed-grey.**
  It's been idle since 2021. Restoring it would be the single biggest
  step-change in Moroccan grid flexibility, and it's a political
  question, not an engineering one.

I'll develop each of these threads in future posts. This one is just
the infrastructure — the scaffolding the rest of the analysis sits on.

## What's next

The [`BACKLOG.md`](https://github.com/redatahiri37/morocco-energy-digital-map/blob/main/BACKLOG.md)
in the repo is the live roadmap. The short version:

- **v1.2**: year-by-year capacity buildout animation (2000 → 2035),
  with a play button. This will be the headline visual.
- **v1.3**: grid-suitability index per 0.1° cell (Pawel-style 1–5
  score blending HV distance, available generation, renewables share,
  cooling-water proximity).
- **MENA expansion**: Egypt is next. The schema is already country-agnostic —
  dropping a `docs/data/egypt/` folder plus one manifest entry is
  literally all it takes on the app side.

## How to contribute

If you work in the sector and see something that's wrong or missing,
the map has a "Report an error" button on every card that opens a
pre-filled email. Or open a PR. The only hard rule: **every correction
needs a public source URL**. No insider knowledge, no "trust me" —
just link me the press release or the filing.

The code is MIT. The data is aggregated from public sources (GEM,
OSM, Datacentermap, operator disclosures) — licenses are listed in
[`DATA_SOURCES.md`](https://github.com/redatahiri37/morocco-energy-digital-map/blob/main/DATA_SOURCES.md).

---

*Reda Tahiri is an energy engineer based in Paris, writing about the
convergence of electricity and digital infrastructure in emerging
markets. This project is not affiliated with any operator, ministry,
or consultancy. All views are the author's.*
