# Nouaceur doesn't need 500 MW of grid. Here's the math.

**Final version — Article 1/3, "Overbuild vs. Orchestrate" series.
Mirrors the live Substack post.**

---

Two weeks ago I argued that the [Nouaceur announcement](https://redatahiri.substack.com/p/the-grid-plan-hasnt-caught-up) is a grid-planning story with a Nvidia logo on the front page.

The open question was what 500 MW of flat AI load actually requires from supply. Turn it around. What does it require from the grid?

Less than 500 MW, structurally less.

> **[Embed: X / Twitter — Ambassador Duke Buchan (@USAmbMorocco)]**
> https://x.com/USAmbMorocco/status/2042254152940540107
>
> *"Yesterday, I witnessed something historic at GITEX Africa 2026.
> Morocco signed a landmark agreement to build the Nexus AI Factory —
> the first sovereign AI infrastructure platform of its kind in Africa.
> $1.2 billion in initial investment. 500 megawatts of planned
> capacity. Powered…"*
>
> 4:51 PM · Apr 9, 2026 · 13.3K Views · 12 Replies · 81 Reposts · 365 Likes

### The Connection Gap

The 500 MW figure is the data center's IT load at full build. It is not the peak the grid sees at the connection point, and the difference is not a rounding error.

AI inference is flat, but not quite at load factor 1.0. Cooling cycles, maintenance windows, and the training-vs-inference mix put hyperscale operations in the 0.92–0.95 range.

Add a modest onsite storage layer and a permitted curtailment envelope of 5–10% on peak hours, and the contracted grid import for a 500 MW campus sizes naturally at 300–400 MW.

The avoided cost is strong: 100–200 MW of transmission reinforcement and firming RES nameplate that ONEE doesn't have to build at the Nouaceur node. In $ terms, conservatively several hundred million.

> *Load shifting at a hyperscale data center — onsite storage and brief curtailment lower coincident peak (Pawel Czyzak, [Energy Extended, 2026](https://paczyzak.substack.com/p/data-center-flexibility-intro))*

### The Battery in the Building

A data center doesn't run at full power every hour of the year, and the load it does have can be controlled within tight bounds. Move a small portion of that load around, through onsite BESS, workload scheduling, brief curtailment during system stress, and the grid sees a smaller, smoother, more plannable customer.

Connection capacity drops. Connection queue time drops. Stranded-asset risk on the utility side drops.

Microsoft, Meta, and Google design every hyperscale this way. The IEA documented the practice in its Energy and AI report last year, with explicit load-profile charts showing the gap between nameplate IT load and grid coincident peak.

> *Data centre capacity additions to 2035 and feasible integration into the current electricity system under different flexibility cases (IEA, [Energy and AI, 2025](https://iea.blob.core.windows.net/assets/de9dea13-b07d-42c5-a398-d1b3ae17d866/EnergyandAI.pdf))*

Morocco wouldn't be pioneering anything here. It would be importing already-deployed best practice.

### The Numbers the PPA Should Have

A back-of-envelope sizing for Nouaceur at full build: 500 MW IT, 24/7, Casablanca profile:

- **Onsite BESS:** 200 MWh / ~50 MW continuous for 4 hours
- **Curtailment envelope:** 5% on the top 100 hours/year
- **Contracted grid import:** ~350–380 MW instead of 500 MW
- **Avoided ONEE transmission reinforcement:** 100–150 MW at the Casablanca southern ring
- **Avoided dedicated Renewable Energy Sources (RES) nameplate** (for 100% renewable supply with storage in the stack): roughly 250–350 MW of PV/wind that doesn't need to be built

However, none of this is in the consortium's public statements.

### The Silence in the Announcement

The [Nexus consortium release](https://www.linkedin.com/posts/nexus-core-systems_morocco-ai-innovation-activity-7448330593987158017-osnf) talks about TAQA Morocco supplying 100% renewable electricity. It does not mention co-located BESS. It does not mention a curtailment envelope. It does not mention a connection capacity smaller than 500 MW.

Either the BESS layer is quietly being designed and just hasn't made the release, or it isn't — in which case Morocco is about to build hundreds of MW of grid and firming renewable projects the project doesn't structurally need.

### Where This Goes

The Nouaceur announcement is the first Act of a longer file. The technical case for under-sizing the grid connection is clear. The cost case:

When is co-located storage cheaper than the transmission reinforcement it avoids?

The next story is → **The cost of storage just crossed the line in Morocco.**

Also for information I'm slowly mapping out the broader picture at [Energy × Digital Nexus](https://redatahiri37.github.io/morocco-energy-digital-map/) — generation, grid, industrial loads, and the data center pipeline on one layer. Nouaceur is on it now.

[Energy × Digital Nexus tool](https://redatahiri37.github.io/morocco-energy-digital-map/)

---

### Sources

**On data center flexibility (the central argument):**
- [Pawel Czyzak — *Data center flexibility (intro)*, Energy Extended](https://paczyzak.substack.com/p/data-center-flexibility-intro)
- [IEA — Energy and AI (2025 update, PDF)](https://iea.blob.core.windows.net/assets/de9dea13-b07d-42c5-a398-d1b3ae17d866/EnergyandAI.pdf)
- Uptime Institute — Annual Global Data Center Survey

**Announcement and political framing:**
- [Ambassador Duke Buchan (@USAmbMorocco) — GITEX Africa 2026 announcement tweet](https://x.com/USAmbMorocco/status/2042254152940540107)
- [Nexus Core Systems — LinkedIn post on the Nexus AI Factory partnership](https://www.linkedin.com/posts/nexus-core-systems_morocco-ai-innovation-activity-7448330593987158017-osnf)
- [Silicon Africa — Nexus AI Factory / Naver / Nvidia](https://siliconafrica.org/morocco-plans-to-host-world-class-ai-hub/)

**Industry siting practice:**
- [Microsoft — Environmental Sustainability Report](https://www.microsoft.com/en-us/corporate-responsibility/sustainability/report)
- [Meta — sustainability data center programs](https://sustainability.atmeta.com/data-centers/)

**Morocco grid context:**
- [IEA — Morocco country profile, electricity](https://www.iea.org/countries/morocco/electricity)
- ONEE — PDITE (Plan Directeur des Infrastructures de Transport Électrique), 2023–2027

**Map:**
- [Energy × Digital Nexus — Morocco Infrastructure Map, v1](https://redatahiri37.github.io/morocco-energy-digital-map/)

**For the next article (BESS cost crossover):**
- [BNEF — Battery Storage System Cost Survey](https://about.bnef.com/blog/)
- [IEA — Batteries and Secure Energy Transitions](https://www.iea.org/reports/batteries-and-secure-energy-transitions)
- [Lazard — Levelized Cost of Storage](https://www.lazard.com/research-insights/levelized-cost-of-energyplus/)
