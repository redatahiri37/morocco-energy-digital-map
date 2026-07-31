# Atlas Solar — Product & Engineering Brief

> **Purpose of this document.** Self-contained brief for anyone (human collaborator, LLM agent, or future me) picking up work on the `/solar/` module. Paste it as the opening message of a new session and add your specific task at the end.

---

## 1. Mission (one sentence)

Turn a Moroccan homeowner's question — *"is a solar roof worth it for me?"* — into a credible, personalized answer in under 30 seconds, and expose the assumptions so power users can stress-test them.

## 2. Why this exists

- **Under 1 %** of Moroccan residential roofs are equipped, on **one of the world's best solar resources** (1 800–2 200 kWh/kWc/yr).
- The gap is not physics or hardware cost — it is **information asymmetry**. Households cannot get a trustworthy production + ROI number without paying an installer for a bespoke quote.
- Loi 82-21 (décret 2.25.100, mars 2026) has just unlocked LV self-consumption + limited export. Demand for a numbers-first tool is opening up now.
- Reference: **Otovo** (Nordics/France/Spain) — same job-to-be-done, market-tested UX. Do not clone; adapt to MA constraints.

## 3. Target user

**Primary.** Middle-class Moroccan homeowner (Casablanca, Rabat, Marrakech, Tanger, Agadir), monthly ONEE bill 200–800 MAD, technically curious, French-speaking, has decided *maybe* — needs numbers before calling an installer.

**Secondary.** Installer sales rep who needs a fast pre-qualification screen when a lead calls in. Journalist / policy researcher who needs a defensible ROI figure to cite.

**Not the target.** Grid engineers, C&I procurement, off-grid rural. Different tools.

## 4. User expectations — what "done" feels like

The user should be able to say all of these after using the tool:

1. **"I got a real number in one screen."** No signup, no email, no long form. Address → number.
2. **"I trust it."** Sources cited, methodology visible, no marketing tone. If the tool doesn't know something (LV export tariff), it says so.
3. **"I could show this to my brother-in-law who's an engineer."** The parameter panel is not a toy — it exposes real levers (tilt, azimuth, cost/Wc, tranche) and updates instantly.
4. **"It respects my time."** Loads in <2 s on 3G. Zero cookie banners, no popups, no re-marketing.
5. **"It works on my phone."** ≥ 60 % of traffic will be mobile — layouts must degrade gracefully.

## 5. Product principles (in priority order)

1. **Radical honesty over optimism.** If the export tariff is uncertain, model it low or make it opt-in. A tool that under-promises and delivers is trusted forever; one that oversells is dead the first time an installer contradicts it.
2. **Two-step or die.** Step 1 = instant estimate on defaults. Step 2 = tune. Never make step 1 harder to make step 2 easier.
3. **Show your work.** Every KPI has a sub-label explaining it (specific yield, self-consumption ratio, avoided-cost blend). No black-box numbers.
4. **French first, Darija-friendly copy.** Formal French, avoid technical jargon in the primary UI. Advanced terms allowed inside the parameter panel.
5. **Fast is a feature.** Static HTML, no framework, no build step, CDN dependencies only.

## 6. Scope

### In-scope (v1)
- Address geocoding (Morocco only, Nominatim)
- Annual + monthly production estimate (PVGIS v5.2)
- ROI: payback, 25-yr cashflow, NPV
- Adjustable: system size, tilt, azimuth, monthly consumption, installed cost, export toggle
- ONEE stepped tariff model with correct top-tranche displacement
- Loi 82-21 export model (20 % cap, 0.18 MAD/kWh upper bound)
- Mini-map showing the geocoded point
- Mobile-responsive down to 375 px

### Out-of-scope (v1, may be added later — see §11)
- Shading analysis (would need a 3D roof model or Google Solar API)
- Real-time installer quotes / lead capture
- Battery/BESS sizing (belongs in a separate `/battery/` module)
- Financing simulator (loans, subsidies) — waiting for MASEN/AMEE incentive clarity
- Multi-language toggle (Arabic, English) — v2
- User accounts, saved simulations, PDF export
- Non-Morocco geographies

## 7. Data & methodology spec

### Production
- **Source.** PVGIS v5.2, endpoint `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc`.
- **Radiation DB.** PVGIS-SARAH3 (default, covers MA).
- **Default losses.** 14 % (soiling + inverter + wiring + mismatch + LID).
- **Constraint.** PVGIS is **not CORS-enabled**. Calls route through our Cloudflare Worker (`solar/proxy/worker.js`) — edge-cached 24 h, rate-limited, French error mapping. Ops guide in `solar/README.md`. The client falls back to `corsproxy.io` only while `CONFIG.PVGIS_WORKER_URL` is still the placeholder.

### Tariff (ONEE residential LV, 2025, TTC incl. 18 % VAT)
| Tranche (kWh/mo) | Prix (MAD/kWh) |
|---|---|
| 0–100 | 0.9010 |
| 101–150 | 1.0732 |
| 151–200 | 1.0732 |
| 201–300 | 1.1676 |
| 301–500 | 1.3817 |
| > 500 | 1.5958 |

Selective billing above 150 kWh/mo (each tranche at its own price). PV displaces from the **top** tranche downward — that is where the money is.

### Installed cost (residential grid-tied, 2025)
- Range 8.5–14 MAD/Wc turnkey. Central 11 MAD/Wc.
- Source: [lechantier.ma](https://lechantier.ma/en/prix/solaire) aggregator, cross-checked with IRENA regional benchmarks.

### Loi 82-21 (décret n° 2.25.100, 5 mars 2026)
- Self-consumption legal for LV residential. Bidirectional meter mandatory.
- Systems < 11 kW: simple prior declaration.
- Surplus injection **capped at 20 % of annual production**.
- Feed-in tariff for LV residential **not yet officially published**. Use MV off-peak (0.18 MAD/kWh) as an optimistic upper bound. Off by default in UI.

### Assumptions in `CONFIG` (easy to swap)
- Degradation 0.5 %/yr, tariff inflation 2 %/yr, discount rate 5 %, life 25 yr, opex 1 %/yr of capex.
- Grid CO₂ factor 0.71 kg/kWh (ONEE 2024 mix).
- Self-consumption ratio heuristic: `0.30 + 0.55·exp(-0.9·(prod/cons))`. Placeholder — replace with measured MA household load-curve data when available.

## 8. Engineering best practices

- **No build step.** Plain HTML + one JS file + one CSS file per module. CDN for libs.
- **One folder per tool.** Each new tool (`/battery/`, `/ev/`, `/roi/`) is a self-contained sibling. No shared framework, no cross-tool imports. Consistent look via copied CSS variables.
- **Modular namespaces inside `app.js`.** `CONFIG`, `Geocoder`, `PVGIS`, `Tariff`, `ROI`, `Chart_`, `MapView`, `UI`. If one file exceeds ~700 LOC, split into ES modules before adding features.
- **All swappable numbers in `CONFIG` at file top.** Never inline a MAD/kWh value in a formula.
- **Debounce network calls.** 300 ms on geocoder; only re-hit PVGIS if lat/lon/kWp/tilt/azimuth changes.
- **Fail visibly, not silently.** Show French-language errors in-page; log full errors to `console.error`.
- **HTML-escape any user input** (address strings) before injecting into DOM.
- **Never store personal data.** No cookies, no analytics that keys on user identity. Coarse aggregate analytics only, and only after asking the user.
- **Deploy target is GitHub Pages** at `redatahiri37.github.io/morocco-energy-digital-map/solar/`. Root-served — do not put the module under `/docs/`.

## 9. Verification checklist (run before merging any change)

1. Type a Moroccan address (e.g., "Rue Ibnou Sina, Rabat") → suggestions appear within 500 ms.
2. Pick a suggestion or click a city chip → step 2 renders KPIs within 3 s.
3. Drag "Puissance installée" slider → all four KPIs and both charts update without flicker.
4. Toggle "Injection réseau" ON → savings increase by exactly `min(surplus, 0.20·annualPv) × 0.18`. Verify with `console` computation.
5. Change "Consommation mensuelle" to 100 → auto-consommation ratio should approach 100 % and savings should scale correctly by top tranche.
6. Resize viewport to 375 px → params panel stacks above main panel; charts remain readable; no horizontal scroll.
7. Open Network tab → PVGIS call goes through the configured proxy; response cached (no duplicate hit on unchanged params).
8. Check that Casablanca 3 kWc, 30°, Sud, 14 % loss returns ~1 640–1 750 kWh/kWc specific yield. Anything outside this range is a red flag.
9. Confirm no console errors on the full flow.
10. Confirm README + PROMPT files updated if any assumption changed.

## 10. Anti-patterns (do not do)

- **Do not** hard-code a "typical" ROI number as a fallback when PVGIS fails. Fail loudly.
- **Do not** add a lead-capture form, chat widget, or newsletter modal. Ever.
- **Do not** import a React/Vue/Svelte framework "just for this component."
- **Do not** silently swap the CO₂ factor, discount rate, or export price without updating this brief + the disclaimer.
- **Do not** couple `/solar/` to `/` (the main map) via shared JS. Same brand, independent code.
- **Do not** display a payback shorter than realistic for the ONEE low-tranche user just because it looks better in screenshots.
- **Do not** claim "official" or "certified" — this is a decision-support tool, not a devis.

## 11. Roadmap hooks (make these easy to add later)

Design v1 so these v2 additions are additive, not rewrites:

1. **Shading input.** Add a slider `shading_loss_pct` that flows into the PVGIS `loss` parameter. Model already supports it.
2. **Battery.** New `/battery/` folder; can consume the same PVGIS response + a household load curve. Keep the self-consumption function in a shared helper only when the second consumer arrives.
3. **PDF export.** Server-less print stylesheet + `window.print()`. Zero deps.
4. **Arabic / English.** Wrap user-facing strings in a `t("key")` function backed by a JSON dictionary. Do not adopt a i18n framework.
5. **Installer marketplace.** Separate module; the estimator remains vendor-neutral. Estimator link to marketplace, never the reverse.
6. ~~**Cloudflare Worker proxy.**~~ **Done (2026-07-31).** `solar/proxy/worker.js` — edge cache 24 h, 60 req/min/IP, French error contract. Ops in `solar/README.md`.

## 12. Success metrics

Track these after launch (not before):

- **North-star.** % of sessions that reach step 2 and adjust at least one parameter. Target > 40 %.
- **Trust.** Bounce rate on step 2 < 30 %. Session duration on step 2 > 90 s.
- **Reach.** 1 000 unique sessions/month within 3 months of a Substack + LinkedIn announcement.
- **Downstream.** Number of installer-quote requests users report initiating after using the tool (survey link in footer, opt-in).

## 13. Context you can assume the reader has

- Repo: `github.com/redatahiri37/morocco-energy-digital-map`, deploys to GitHub Pages from `main` root.
- Broader project: **Atlas Nexus** — interactive infra map + thought-leadership blog on energy × digital in emerging markets (see `context.md`, `BRANDING.md`).
- Owner: energy & digital infra expert based in Paris, high technical fluency on power systems, grid economics, project finance. No hand-holding needed on domain concepts; heavy demand for defensible numbers.

---

## How to use this brief

**Paste this file** as the opening of a new session, then add your task, e.g.:

> [pasted PROMPT.md]
>
> Task for this session: add a shading-loss slider (0–30 %) in the parameter panel, wired into the PVGIS `loss` param. Verify the round-trip and update the disclaimer.

Or for a broader ask:

> [pasted PROMPT.md]
>
> Task: add the sensitivity view (§11) — tornado chart showing how each input moves the payback.
