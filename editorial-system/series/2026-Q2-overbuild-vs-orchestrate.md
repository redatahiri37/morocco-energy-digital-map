# Series Plan — "Overbuild vs. Orchestrate"

**Series window:** Q2 2026 (W18–W20)
**Anchor:** Energy × Digital Nexus Substack
**Genesis post:** [W17 "A 500 MW AI load lands in Morocco. The grid plan hasn't caught up."](../drafts/2026-W17-substack.md)

---

## Series payoff thesis (the big idea)

The Nouaceur announcement implies Morocco needs to build hundreds of
MW of dedicated renewable nameplate, transmission reinforcement, and
firming storage to serve one 500 MW data center. It probably doesn't.
The actual technical requirement is significantly smaller — *if*
Morocco builds the regulatory framework to value flexibility across a
stack of resources, from utility-scale BESS down to the smart meter
in a Casablanca apartment.

The choice between *overbuilding the grid* and *orchestrating the
stack* is the single biggest grid-policy decision Morocco will make
this decade. The series walks the reader through why orchestrate
wins on engineering, wins on cost, and is currently losing on
politics — and what would have to change.

## Thesis sub-claim mapping (from THESIS.md)

- **Article 1** → primarily sub-claim #3 (industrial demand response
  / flexibility is the missing layer)
- **Article 2** → primarily sub-claim #2 (compute load as new
  industrial load) + sub-claim #3 (economics of serving it)
- **Article 3** → sub-claim #3 throughout + sub-claim #1
  (electron's passport — regulatory passport for flex) in the close

## Connection to W17 (Nouaceur post)

The Nouaceur piece ended with an open question: does Morocco have a
coordination model for two flat-load archipelagos competing for the
same clean electron pool? This series is the long answer. Every
article should explicitly reference back to the W17 setup — not as
a footnote, but as the case study the analysis returns to.

## Series cadence

- W18 (May 4–10): Article 1 publishes
- W19 (May 11–17): Article 2 publishes
- W20 (May 18–24): Article 3 publishes
- W21: One-week pause / synthesis. If the series gets engagement,
  consider a monthly long-form recap.

Each article: ~1,100–1,300 words, one anchor chart, ends with an
open question that bridges to the next.

---

## Article 1 — "Nouaceur doesn't need 500 MW of grid. Here's the math."

**Target week:** W18 (publishes ~May 6, 2026)

**Hook (one sentence):** Announced data center capacity is not the
same number as required grid connection — and the gap, in
Nouaceur's case, is roughly the same size as a midsize
hydroelectric plant.

**Structure:**
1. Open with the W17 hook restated: 500 MW flat 24/7, "100%
   renewable." But what does the *grid* see at the connection point?
2. Walk through coincident-peak analysis: AI inference is closer to
   95% load factor than 100% (cooling cycles, maintenance, training
   vs. inference mix). With even modest on-site BESS (≈200 MWh /
   ~4-hour discharge at 50 MW), peak grid import drops noticeably.
3. With co-located BESS sized at 100–200 MWh and a permitted
   curtailment envelope of 5–10% at peak hours, the contracted grid
   connection can be 300–400 MW instead of 500 MW.
4. The avoided cost: 100–200 MW of transmission reinforcement and
   firming capacity that ONEE doesn't have to build. In MAD terms,
   conservatively several hundred MAD million.
5. The technical precedent: this is already how Microsoft and Meta
   site-design new hyperscale campuses. Morocco is not pioneering
   anything — it's importing best practice.
6. Closing question (bridge to A2): if the math works, why hasn't
   the announcement said anything about co-located BESS? Probably
   because the economics haven't been calibrated for Morocco yet.
   Next week: do the numbers.

**Anchor chart:** 24-hour load profile, stacked area:
- Without BESS: flat 500 MW grid import all day
- With 200 MWh co-located BESS: grid import averages ~350 MW with
  shaved peaks and charging dips
- Synthetic Casablanca solar profile overlaid as a secondary line

**Sources to cite (in order of priority for the draft):**

*Technical and methodological references:*
- [IEA — Energy and AI report (2024)](https://www.iea.org/reports/energy-and-ai) ✓ verified, already in user's files
- [Pawel Czyzak — "Data center flexibility (intro)"](https://paczyzak.substack.com/p/data-center-flexibility-intro) ✓ used in W17
- [RMI — "The Power of Energy Flexibility"](https://rmi.org/insight/power-of-energy-flexibility/) (high confidence; verify exact slug at draft stage)
- [Ember Energy — research portal](https://ember-energy.org/research/) — search for "grid connection" and "data center" tagged pieces

*Industry siting practice (Microsoft / Meta / Google):*
- [Microsoft sustainability report — data center carbon/grid section](https://www.microsoft.com/en-us/corporate-responsibility/sustainability/report) (high confidence on landing page; specific year report URL needs check)
- [Meta — sustainability data center page](https://sustainability.atmeta.com/data-centers/) (verify)
- [Uptime Institute — annual global survey](https://uptimeinstitute.com/resources/research-and-reports) (high confidence on landing page)

*Morocco-specific context to anchor the avoided-cost figure:*
- [ONEE — Rapport d'activité (annual)](https://www.onee.org.ma/publication/) (verify exact URL; ONEE often gates documents)
- [World Bank — Morocco Energy Sector Projects portal](https://projects.worldbank.org/en/projects-operations/projects-list?countrycode_exact=MA) ✓ (high confidence)

*To verify before draft:*
- Coincident-peak load factor data for an AI training/inference mix —
  cite Uptime Institute or a specific hyperscaler's published profile,
  not general assertion.
- Cost-per-MW figure for transmission reinforcement in Morocco —
  ONEE's PDITE has annexes; the WBG project appraisal documents
  for the 2018 HVDC masterplan publish per-km / per-MW figures.

---

## Article 2 — "The cost of storage just crossed the line in Morocco."

**Target week:** W19 (publishes ~May 13, 2026)

**Hook (one sentence):** At today's installed BESS prices and
Morocco-specific transmission cost assumptions, four hours of
co-located storage is now cheaper per MW of avoided peak than the
grid reinforcement that would otherwise serve that peak.

**Structure:**
1. Open with the BNEF / IRENA cost curve — 4-hour BESS dropped from
   ~$600/kWh installed in 2020 to ~$250–300/kWh in 2024–25. State
   the number plainly.
2. Convert to LCOE for a Moroccan profile: high insolation, moderate
   wind, cycling profile of a data center firming application
   (1–2 cycles/day). LCOE lands around $X/MWh — show the math.
3. Compare to the alternative: building 1.2–1.5 GW of overbuilt RES
   to deliver 500 MW firm without storage (curtailment costs); or
   importing via the Iberian interconnection (capacity charge +
   imports).
4. The crossover: BESS is now structurally cheaper for the firming
   layer in Morocco. But this is only true if the BESS can stack
   revenue — energy arbitrage + capacity + ancillary. Today, in
   Morocco, it can't, because the ancillary market doesn't exist
   (bridge to A3).
5. Morocco-specific anchors: Noor Midelt I (PV + CSP + BESS hybrid
   tender) priced storage at a known level; MASEN's recent
   procurement signals; what an actual Nouaceur co-located BESS
   would cost at IRENA reference prices.
6. The honest counter-argument: BNEF prices are LCOS for utility-scale
   stationary BESS in mature markets. Morocco-specific cost premiums
   (import duty, financing cost, lower cycle count without ancillary
   revenue) shift the curve. Quantify the premium.
7. Closing question (bridge to A3): if the engineering works (A1)
   and the cost works (A2), why isn't anyone building it? Because
   the revenue stack to pay for it doesn't exist in Moroccan
   regulation. Next week.

**Anchor chart:** BESS LCOE vs. avoided-cost LCOE over time, 2020–2026,
with the Morocco crossover point marked. Use BNEF or IRENA cost data
on the BESS side; use WBG project appraisal data or IEA Morocco
country profile for the grid side.

**Sources to cite:**

*BESS cost curves (highest priority):*
- [BNEF — Battery Storage System Cost Survey (annual; about.bnef.com/blog summaries)](https://about.bnef.com/blog/) ✓ (high confidence on landing; specific year survey may be paywalled, summaries are public)
- [IEA — Batteries and Secure Energy Transitions (2024)](https://www.iea.org/reports/batteries-and-secure-energy-transitions) ✓ verified
- [IRENA — Electricity Storage Valuation Framework](https://www.irena.org/Publications/2020/Mar/Electricity-Storage-Valuation-Framework-2020) (high confidence; 2020 base; check for newer)
- [IRENA — Renewable Power Generation Costs (annual)](https://www.irena.org/Publications) ✓ (search at IRENA Publications)
- [Lazard — Levelized Cost of Storage (LCOS+ annual)](https://www.lazard.com/research-insights/levelized-cost-of-energyplus/) ✓ (high confidence)

*Morocco-specific anchors:*
- [MASEN — Noor Midelt project page](https://www.masen.ma/en/projects-masen/noor-midelt-i) (verify exact slug)
- [World Bank — Noor Midelt project appraisal documents](https://projects.worldbank.org/en/projects-operations/project-detail/P163786) (verify project ID; WBG publishes detailed cost tables)
- [AfDB — Morocco energy operations](https://www.afdb.org/en/countries/north-africa/morocco/african-development-bank-operations-morocco) ✓ (high confidence on landing)
- [ANRE — Décisions et publications](https://www.anre.ma/) ✓ (high confidence on landing; navigate to recent publications)

*Comparative storage markets (to set context):*
- [Spain — REE / OMIE ancillary market data](https://www.ree.es/en) and [OMIE](https://www.omie.es/en) ✓
- [UK — National Grid ESO Future Energy Scenarios](https://www.nationalgrideso.com/future-energy/future-energy-scenarios) ✓

*Related thinking:*
- [Pawel Czyzak — Energy, Extended (Substack)](https://paczyzak.substack.com/) — search his archive for cost-of-flex pieces
- [Carbon Tracker — Sun Cable / storage analysis pieces](https://carbontracker.org/insights/) ✓ (search for storage)
- [IEEFA — battery storage analysis](https://ieefa.org/) ✓ (search "battery")

*To verify before draft:*
- Exact installed BESS price ($/kWh) for the most recent IRENA / BNEF
  publication year accessible. State the date and source clearly in
  the chart caption.
- Noor Midelt I storage component price per kWh — if not publicly
  itemized, use it as a comparison floor with an explicit caveat.
- ONEE's transmission reinforcement cost per MW served at peak —
  PDITE annex or WBG project document.

---

## Article 3 — "The flexibility stack: from Nouaceur to the smart meter"

**Target week:** W20 (publishes ~May 20, 2026)

**Hook (one sentence):** Morocco's flexibility problem is not one
asset class but a four-layer stack, and only the top layer is
currently being planned — which is why the engineering case from
weeks 1 and 2 doesn't pay anyone yet.

**Structure:**
1. Open with the Nouaceur frame restated, then widen: flexibility
   isn't one big thing. It's a stack.
2. **Layer 1 — Transmission-scale BESS.** 100+ MW assets at ONEE /
   MASEN sites. Where Articles 1–2 ended. Currently the only layer
   with active planning. Status: pilot stage.
3. **Layer 2 — Industrial DR.** OCP phosphate corridor (~1 GW),
   cement plants, steel, and now Nouaceur. Tens to hundreds of MW
   per contract. Status: ad-hoc bilateral; no published framework.
4. **Layer 3 — Commercial behind-the-meter PV + BESS.** Logistics,
   agro-industrial, tertiary real estate. Single-digit MW per site,
   hundreds of sites. Status: gated by Loi 13-09 BTM restrictions
   and unclear export rules.
5. **Layer 4 — Residential rooftop PV + smart-metered demand
   response.** kW-scale, aggregated. Status: smart meter rollout
   underway (Lydec, RADEEMA); aggregation framework absent.
6. The unlock: ANRE issues a flexibility tariff framework that
   values capacity across all four layers, with a settlement
   protocol jointly published by ONEE and the regulated distributors.
   That's it. The engineering is solved. The institutional design
   is the bottleneck.
7. Comparative section: how Spain (Iberian market), the UK
   (Capacity Market + DSF), and Germany (Redispatch 2.0 + aFRR)
   built their stacks. Morocco doesn't need to invent — it needs
   to adapt.
8. Bring it back to Nouaceur: if the framework opens, Nouaceur is
   the catalyst customer, OCP is customer #2, and the residential
   rooftop in Salé is the dividend. One regulatory file. Three
   constituencies.
9. Closing question: Morocco built RES capacity ahead of demand for
   a decade. Will it build the regulatory layer ahead of demand for
   the next one — or wait until Nouaceur, then OCP, then a third
   announcement forces it reactively?

**Anchor chart:** The flexibility stack as a pyramid, 4 layers:
- Layer 1 (top, narrow): 100+ MW per asset, ~1–2 assets planned
- Layer 2: 10–100 MW per contract, ~3–5 active conversations
- Layer 3: 0.5–5 MW per site, hundreds of sites theoretically
- Layer 4 (bottom, wide): 0.5–20 kW per household, millions
- Color-code each layer: green (regulated + operational), yellow
  (partially regulated), red (no framework). Morocco today is
  yellow-yellow-red-red. Target state is all green.

**Sources to cite:**

*Moroccan regulatory landscape:*
- [ANRE — official site](https://www.anre.ma/) ✓ (regulator; navigate to "Décisions" for latest rulings)
- [MEM — Ministère de la Transition Énergétique](https://www.mem.gov.ma/) ✓ (high confidence)
- Loi 13-09 — search Bulletin Officiel for original + amendments;
  [SGG.gov.ma](https://www.sgg.gov.ma/) is the canonical source ✓
- [ONEE — actualités](https://www.onee.org.ma/actualites/) ✓
- [Lydec — actualités et publications](https://www.lydec.ma/) ✓ (high confidence on landing; search for "comptage intelligent")
- [RADEEMA — publications](https://www.radeema.ma/) ✓ (high confidence on landing)

*Smart meter rollout (to verify with current data):*
- Lydec smart meter press releases (search Lydec.ma "compteur intelligent")
- RADEEMA smart meter program (search Radeema.ma)
- [World Bank — Morocco smart grid projects in the project portal](https://projects.worldbank.org/en/projects-operations/projects-list?countrycode_exact=MA) ✓

*Comparative flexibility market design:*
- [ENTSO-E — Market Design publications](https://www.entsoe.eu/publications/market-reports/) ✓
- [Spain — REE Operating Procedures](https://www.ree.es/en/activities/operation-of-the-electricity-system) ✓
- [UK — National Grid ESO Capacity Market](https://www.nationalgrideso.com/electricity-markets/capacity-market) ✓
- [UK — Ofgem Demand Side Response](https://www.ofgem.gov.uk/) ✓ (search "DSR")
- [Germany — BNetzA on flexibility / Redispatch 2.0](https://www.bundesnetzagentur.de/EN/) ✓ (search "Redispatch")

*Distributed flex and aggregation thinking:*
- [RMI — Distributed Energy Resources insights](https://rmi.org/insights/) ✓ (search "DER")
- [Brattle Group — DR and flexibility studies](https://www.brattle.com/insights-events/publications/) ✓
- [IRENA — Innovation Landscape for a Renewable-Powered Future](https://www.irena.org/publications/2019/Feb/Innovation-landscape-for-a-renewable-powered-future) ✓

*Pawel Czyzak references that may apply:*
- His broader Ember work on flexibility — [Ember Energy](https://ember-energy.org/) ✓ (search Pawel's author page)

*To verify before draft (Scout assignment for W19):*
- Most recent Lydec / RADEEMA smart meter deployment numbers
  (units installed, % coverage by city)
- Current state of Loi 13-09 BTM amendments — what's the latest
  version, what's still gated
- Any ANRE published consultation or decision on distributed-RES
  tariff or storage in the last 12 months
- Whether MASEN has any role in flexibility procurement or is still
  pure RES procurement

---

## Cross-series sources (use across all three articles)

**Anchor data sources:**
- [IEA — Morocco country profile](https://www.iea.org/countries/morocco) ✓
- [IEA — Energy and AI](https://www.iea.org/reports/energy-and-ai) ✓ (in user's files: EnergyandAI.pdf)
- [IEA — Energy Policies beyond IEA Countries: Morocco](https://www.iea.org/reports/energy-policies-beyond-iea-countries-morocco) ✓ (in user's files)
- [IRENA — Statistics portal](https://www.irena.org/Data) ✓
- [Ember Energy — Africa data](https://ember-energy.org/data/) ✓
- [BNEF — public blog](https://about.bnef.com/blog/) ✓
- [Climate Action Tracker — Morocco](https://climateactiontracker.org/countries/morocco/) ✓

**Commentary / register references (for tone calibration, not for citing):**
- Pawel Czyzak — Energy, Extended (Substack)
- David Fickling — Bloomberg Opinion
- Javier Blas — Bloomberg Opinion
- Stratechery — for analytical structure

**Moroccan institutional sources (use specific URLs after verification):**
- ONEE — onee.org.ma
- MASEN — masen.ma
- ANRE — anre.ma
- MEM — mem.gov.ma
- TAQA Morocco — taqamorocco.ma
- OCP Group — ocpgroup.ma
- HCP (statistics) — hcp.ma

---

## Scout assignments derived from this plan

Add these to the W18 Scout brief:
- Any new BESS tender or award in Morocco or Maghreb
- Any ANRE decision or consultation in the last 4 weeks
- Any Lydec / RADEEMA smart meter press release in the last 4 weeks
- Pawel Czyzak / Ember new posts on data center flexibility or
  grid connection economics
- BNEF or IEA quarterly battery cost update if published

---

## Open editorial questions for Reda

1. **Chart production:** Anchor charts can be produced in Python
   (matplotlib) or directly via the AI Atlas codebase. Want to
   commit to one chart style/family for the series so they read as
   a set?
2. **Title style:** Articles 1–2 working titles are punchy; A3 is
   more descriptive. Want to make them parallel (e.g., all start
   with a number, or all are statements of inversion)?
3. **Substack section / collection:** Substack supports
   "collections." Worth creating a "Overbuild vs. Orchestrate"
   collection so the three pieces show as a series in the reader's
   inbox.
4. **Promotion cadence:** LinkedIn teaser per article, or one
   master LinkedIn post at the end of the series? My instinct: one
   teaser per article (the cadence we just established).

---

*This plan is a living document. Update as Scout signals arrive
during W18–W20 and as drafts surface unexpected angles.*
