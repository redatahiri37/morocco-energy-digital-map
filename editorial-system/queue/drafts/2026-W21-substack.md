# The flexibility stack: from Nouaceur to the smart meter.

**Article 3/3, "Overbuild vs. Orchestrate" series.
Target publish: Friday May 29, 2026 (W21). Closes the series.**

---

Two pieces back I argued [Nouaceur's grid connection should be smaller](https://redatahiri.substack.com/p/nouaceur-doesnt-need-500-mw) than the press release suggests. Last week I argued [storage is already cheap enough](https://redatahiri.substack.com/p/cost-of-storage-just-crossed-the-line) — and that ACWA and ONEE have ratified the cost case in their own procurement, not in a forecast.

Both pieces are engineering and cost stories. Neither moves capital on its own.

What moves capital is the **revenue stack**. And the news that almost nobody covered properly is that ANRE quietly built the first two layers of that stack between January and February of this year.

This is the third and final piece. It maps the stack, identifies what's still missing, and argues the regulatory unlock is already in motion — just three weeks from going operational.

### The Stack

Morocco's flexibility problem isn't one asset class. It's four layers, top to bottom:

- **Layer 1** — Transmission-scale BESS. 100+ MW assets at ONEE/MASEN sites.
- **Layer 2** — Industrial demand response. 10–1,000 MW per contract: OCP, cement, steel, soon Nouaceur.
- **Layer 3** — Commercial behind-the-meter PV + BESS. 0.5–5 MW per site, hundreds of sites possible.
- **Layer 4** — Residential rooftop PV + smart-metered aggregation. kW-scale, millions of points.

Six months ago all four layers were red — no published framework. Today the picture is materially different.

### Layer 1: Executing

This is the layer Articles 1 and 2 were about. ONEE issued an expression of interest for [1,600 MWh of standalone BESS across ten sites](https://www.africa-energy.com/news-centre/article/morocco-issues-tenders-battery-energy-storage-sites-and-three) — Kenitra, Settat, Al Massira, and seven others. Commissioning targeted end-2025 through mid-2026. Procurement model: international EPC + long-term O&M.

In parallel, MASEN's [Noor Midelt II and III awards](https://www.pv-magazine.com/2025/08/06/acwa-power-secures-two-solar-plus-storage-projects-in-morocco/) brought 600 MWh of co-located BESS into the system at $32.5/MWh PV+BESS LCOE — bundled into a 30-year PPA.

Layer 1 is functional. The revenue model is "wrapped in the PPA" rather than "merchant on a flex market," but capital is moving and assets are being procured. Green.

### Layer 2: Ad-hoc bilateral

This is where OCP sits. The phosphate group's [$13B Green Investment Program 2023–2027](https://www.ocpgroup.ma/Strategy/Commitments/Green-Investment-Program) commits to 100% green electricity by 2027 across all industrial sites — solar at Khouribga and Benguérir (IFC-financed, 202 MWp), wind, hydro, cogeneration.

But that's OCP **self-supplying**, not OCP providing dispatchable load relief to ONEE. There's no published industrial DR tariff. No interruptibility contract framework. Cement, steel, and the Nouaceur consortium negotiate bilaterally with TAQA, ACWA, or ONEE on a case-by-case basis, with terms that aren't disclosed.

The fix isn't hard. Spain has it — [Servicio de Gestión de la Demanda de Interrumpibilidad](https://www.ree.es/en) clears MW of industrial demand response in an annual auction. France has run the [NEBEF mechanism](https://www.services-rte.com/en/view-data-published-by-rte/nebef-mechanism-demand-response.html) (*Notification d'Échange de Blocs d'Effacement*) since January 2014 — RTE lets industrials, directly or through aggregators, sell load reductions into day-ahead and intraday markets on the same terms as generation; France stacks that with its [capacity mechanism](https://www.rte-france.com/en) so a Cleon or Dunkerque plant can earn for both *being available to reduce* and *actually reducing*. The UK runs [Demand Side Response](https://www.nationalgrideso.com/) through National Grid ESO. Germany's [AbLaV](https://www.bundesnetzagentur.de/EN/) ordinance pays industrials for being interruptible.

Morocco needs the equivalent. The technical case is unambiguous: OCP's load curve, cement plant arc furnaces, and a 500 MW data center are some of the most controllable loads on the system. Yellow, with no movement.

### Layer 3: Just unlocked

This is the news that should have been a front page in February and wasn't.

The Cabinet adopted the implementing decree for [Loi 82-21 on self-production](https://medias24.com/2026/03/21/electricity-morocco-opens-self-production-after-three-years-of-waiting-1645893/) in October 2025. Between **January 30 and February 20, 2026**, ANRE published four decisions setting the final numerical parameters. The framework goes operational **June 9, 2026** — twenty-one days from this article's publication.

The key parameters, [per ANRE](https://www.pv-magazine.com/2026/02/23/morocco-sets-net%E2%80%91metering-tariffs-for-high-and-medium%E2%80%91voltage-systems/):

- Self-producers can inject and sell surplus into the public grid, capped at **20% of annual production**
- Buy-back rates: **$0.21/kWh peak, $0.18/kWh off-peak**
- Use-of-system charges: $0.0607/kWh on medium voltage, $0.0685/kWh on high voltage
- Total connection capacity ceiling: **3,886 MW** (72% solar, 28% wind)
- Legal basis: Loi 13-09 + Loi 82-21

That's a real framework. Better than the equivalent in Spain or France circa 2012. The 20% surplus cap is the binding constraint — it stops the rooftop sector from becoming an arbitrage play and limits oversizing. The capacity ceiling rations the queue.

What's missing for L3 to function as a *flexibility* layer (rather than just a self-supply layer) is co-located BESS treatment. The current decree doesn't address whether a commercial site with PV+BESS can shift its 20% surplus to peak hours. It probably can — the buy-back rates are time-of-use — but the operational rules aren't published yet.

Yellow, moving green. June 9.

### Layer 4: Pilot stage

Smart meters in Morocco today are a Marrakech story. [RADEEMA's smart grid pilot](https://www.ustda.gov/ustda-supports-moroccos-first-smart-grid-deployment/), funded by USTDA, is the first national-scale deployment and is meant to be a template for other cities. Lydec runs a parallel program in Casablanca, deployment numbers not public.

The LV self-consumption tariff — the residential equivalent of the MV/HV bands ANRE just published — is still pending. Until it's published, residential rooftop PV is technically legal but commercially gated.

The aggregation framework — the rules letting a third party bundle a thousand residential systems and sell that aggregate flexibility as a single product into the wholesale market — doesn't exist anywhere in Moroccan regulation.

This is the layer the bait piece next week is about. Pakistan and Lebanon already showed what happens to Layer 4 in the absence of policy: it explodes when the retail tariff gets too expensive to ignore. Morocco's residential tariff at $0.127/kWh is still below that pain point, but the [2027 structural tariff overhaul on ANRE's calendar](https://en.greentimes.ma/electricity-a-structural-tariff-overhaul-scheduled-for-2027/) is when the LV pricing logic will be redone — and that's likely the unlock moment for L4.

Red, with smart-meter infrastructure being laid.

### The ancillary services question

Hidden in the same ANRE update that set transmission tariffs: on March 1, 2025, the regulator [set the ancillary services compensation tariff at **6.64 centimes/kWh** (~$0.007/kWh)](https://anre.ma/en/actualites/the-national-electricity-regulatory-authority-updating-the-tariff-for-the-use-of-the-national-electricity-transmission-network-starting-from-march-1st-2025/).

That's a small number. But it's a **real** number. A BESS providing frequency regulation now has a published compensation rate to model against in its project finance memo.

What's not yet there is a competitive procurement market for ancillaries. In Spain or the UK, ancillary services clear in TSO auctions, prices rise during system stress, and a fast-responding BESS can earn 5–15x the time-average. That option value isn't in the Moroccan framework yet. The 6.64 cents is an administered tariff, not a discovery mechanism.

Stack-revenue arithmetic for a Moroccan BESS today:
- **Energy arbitrage:** $80–120/MWh spread between solar midday glut and evening peak, ~250–350 cycles/year unconstrained, ~150–200 cycles in PPA configurations
- **Capacity:** zero. No published BESS capacity remuneration scheme.
- **Ancillary:** 6.64 ct/kWh administered. Maybe $5–10/MWh on a utilization-weighted basis.

A Spanish BESS stacks all three and gets $200–280/MWh combined. A Moroccan BESS gets ~$100/MWh. That gap is exactly the revenue stack ANRE has to build.

### Why the stack works as a stack

Each layer reinforces the others.

L1 BESS at substations balances bulk system flows and reduces the volatility everyone else faces. L2 industrial DR lets ONEE defer T&D reinforcement and creates the procurement template for L3. L3 commercial BTM exports surplus into the L1 market and provides distributed frequency support. L4 residential aggregation provides the deep, slow-changing flex that EV adoption and electrification will eventually require.

A four-layer stack with priced settlement at each layer is what moves Morocco from "BESS pilots wrapped in PPAs" to "merchant flexibility as an investable asset class." That transition is what Germany made in 2017–2020 with Redispatch 2.0, what the UK made in 2014–2018 with the Capacity Market + DSF, what Spain made in 2018–2022 with REE's procedure reforms.

Morocco doesn't have to invent any of it. The institutional designs are public, debated, and bench-tested.

### Bring it back to Nouaceur

If the stack opens out:

- **L1** procures the 1.6 GWh ONEE BESS by mid-2026; Noor Midelt II/III hybrid storage online by 2027–28.
- **L2** gets a published industrial DR tariff in 2026–27; Nouaceur signs as the catalyst customer, OCP as customer #2.
- **L3** goes operational June 9, 2026. Casablanca logistics, agro-industrial, tertiary real estate get a route to monetize PV.
- **L4** waits for the LV tariff. Probably 2027, possibly aligned with the structural tariff overhaul.

One regulatory file, three years, four operational layers. Versus the alternative: keep building T&D reinforcement and overbuilt RES nameplate every time a hyperscale customer lands.

### Closing

For ten years Morocco built renewable capacity ahead of demand. That decision aged well — the country now exports clean electrons to Spain and is the lowest-cost solar producer in MENA.

The next decade's analogue isn't more nameplate. It's the regulatory layer that monetizes flexibility across four asset classes, from a 100 MW BESS at Kenitra to a 3 kW rooftop in Salé.

The Jan–Feb 2026 ANRE decisions suggest the regulator has decided to lead rather than wait for Nouaceur to force the file. The [2027 structural tariff overhaul](https://en.greentimes.ma/electricity-a-structural-tariff-overhaul-scheduled-for-2027/) is where that decision shows in concrete numbers across all four consumer classes.

The series ends here. If anyone in Rabat is working this file and wants to compare notes on how the stack could be sequenced, my email is in the byline.

Next on the blog → **the rooftop in Salé.** Why every Moroccan parabole will sit next to a solar panel by 2030 — what Lebanon and Pakistan already did, and what Morocco's new self-consumption decree changes June 9.

The map is updating. [Energy × Digital Nexus](https://redatahiri37.github.io/morocco-energy-digital-map/).

---

### Sources

**Moroccan regulatory landscape (the news):**
- [Medias24 — "Electricity: Morocco opens self-production after three years of waiting" (March 2026)](https://medias24.com/2026/03/21/electricity-morocco-opens-self-production-after-three-years-of-waiting-1645893/)
- [PV Magazine — Morocco unlocks solar self-consumption (March 2026)](https://www.pv-magazine.com/2026/03/20/morocco-finally-unlocks-solar-self%E2%80%91consumption/)
- [PV Magazine — Morocco sets net-metering tariffs for HV/MV (Feb 2026)](https://www.pv-magazine.com/2026/02/23/morocco-sets-net%E2%80%91metering-tariffs-for-high-and-medium%E2%80%91voltage-systems/)
- [Morocco World News — ANRE establishes renewable surplus compensation framework](https://www.moroccoworldnews.com/2026/02/279631/moroccos-anre-establishes-framework-for-renewable-surplus-compensation/)
- [ANRE — Transmission tariff and ancillary services compensation, March 1, 2025](https://anre.ma/en/actualites/the-national-electricity-regulatory-authority-updating-the-tariff-for-the-use-of-the-national-electricity-transmission-network-starting-from-march-1st-2025/)
- [Morocco World News — ANRE 2024 transmission report](https://www.moroccoworldnews.com/2026/01/274199/anre-2024-report-transmission-tariffs-cut-as-revenues-reach-mad-64-3-million/)
- [Greentimes — Structural tariff overhaul scheduled for 2027](https://en.greentimes.ma/electricity-a-structural-tariff-overhaul-scheduled-for-2027/)
- [Enerdata — ANRE approves 9.3 GW wind/solar target by 2029](https://www.enerdata.net/publications/daily-energy-news/moroccos-anre-approves-wind-and-solar-capacity-target-2029-93-gw.html)

**Layer 1 — utility-scale BESS:**
- [PV Magazine — ACWA Noor Midelt II/III award (Aug 2025)](https://www.pv-magazine.com/2025/08/06/acwa-power-secures-two-solar-plus-storage-projects-in-morocco/)
- [Africa Energy — ONEE issues tenders for BESS sites](https://www.africa-energy.com/news-centre/article/morocco-issues-tenders-battery-energy-storage-sites-and-three)

**Layer 2 — industrial demand:**
- [OCP — Green Investment Program](https://www.ocpgroup.ma/Strategy/Commitments/Green-Investment-Program)
- [IEA — OCP Green Investment Program policy entry](https://www.iea.org/policies/17251-ocp-group-green-investment-program)
- [IFC — OCP solar partnership ($100M green loan)](https://www.ifc.org/en/pressroom/2023/ifc-and-ocp-group-partner-to-build-solar-plants-green-fertilizer-production-in-morocco)

**Layer 4 — smart meters and distribution:**
- [USTDA — Morocco's first smart grid deployment (RADEEMA / Marrakech)](https://www.ustda.gov/ustda-supports-moroccos-first-smart-grid-deployment/)
- [MENALINKS — flexibility and urban smart grids in Morocco](https://www.menalinks.org/news/menalinks-aligns-with-stakeholder-priorities-in-morocco)

**Comparative flexibility market design (the institutional templates):**
- [REE — Spanish system operation](https://www.ree.es/en/activities/operation-of-the-electricity-system)
- [RTE — NEBEF mechanism (Demand Response Block Exchange Notification)](https://www.services-rte.com/en/view-data-published-by-rte/nebef-mechanism-demand-response.html)
- [RTE — Market mechanisms / effacement, *Bilan électrique*](https://bilan-electrique-2021.rte-france.com/mecanisme-marches-effacements/?lang=en)
- [National Grid ESO — Capacity Market](https://www.nationalgrideso.com/electricity-markets/capacity-market)
- [BNetzA — Redispatch 2.0 / flexibility](https://www.bundesnetzagentur.de/EN/)

**Series:**
- [Article 1 — Nouaceur doesn't need 500 MW of grid](https://redatahiri.substack.com/p/[your-W18-slug])
- [Article 2 — The cost of storage just crossed the line](https://redatahiri.substack.com/p/[your-W20-slug])

**Map:**
- [Energy × Digital Nexus — Morocco Infrastructure Map, v1](https://redatahiri37.github.io/morocco-energy-digital-map/)
