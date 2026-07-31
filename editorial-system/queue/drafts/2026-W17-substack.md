# A 500 MW AI load lands in Morocco. The grid plan hasn't caught up.

**Final — Substack post, Week 17 (2026-04-24). Reda's edit + linked references.**

---

At [GITEX Africa Morocco in April](https://www.moroccoworldnews.com/2026/04/286411/nexus-factory-launch-at-gitex-africa-positions-morocco-as-a-future-ai-gateway/),
a consortium led by Nexus Core Systems, with Naver Cloud as operator,
Nvidia supplying GB200 Blackwell GPUs, Lloyds Capital financing, and
TAQA Morocco providing power, [announced a $1.2 billion AI data center](https://siliconafrica.org/morocco-plans-to-host-world-class-ai-hub/)
in Nouaceur, southern of Casablanca. The target capacity is 500
megawatts.

Supply, per the announcement, will be 100% renewable.

Every headline framed this as a digital infrastructure story.

It isn't.

It's a grid-planning story with a Nvidia/GPU logo on the front page.

500 MW at full build is roughly 7% of Morocco's [2025 peak demand of about 7 GW](https://www.iea.org/countries/morocco/electricity),
and about 4% of installed capacity. It is not a small number. A 500 MW
flat load — and AI inference is flat, 24/7, with load factor approaching
1.0 — is the single largest new industrial customer Morocco has
connected since the phosphate corridor's last expansion.

Phase 1, [originally scheduled for 40 MW in Q1 2026](https://enterpriseam.com/logistics/2026/04/06/morocco-lines-up-a-bigger-ai-infrastructure-play-in-nouaceur/),
is now reportedly at [16 MW activated with MAD 5 billion mobilized and
50 direct jobs](https://en.yabiladi.com/articles/details/191563/data-center-project-morocco-clears).
Full 500 MW is promised by end of phase 2 in 2027. Those two timelines
imply an average annual build rate of about 240 MW once phase 1 is
commissioned. For reference, [Morocco's entire PV capacity additions
in 2022–2024](https://www.irena.org/Publications/2025/Mar/Renewable-capacity-statistics-2025)
ran at roughly that pace across all sites, not one.

So the first question isn't whether the data center gets built. It's
what 500 MW of incremental flat demand, powered exclusively by
renewables, actually requires on the supply side.

As [Pawel Czyzak](https://paczyzak.substack.com/p/data-center-flexibility-intro)
mentions, allowing data centers flexibility and to progressively
integrate the grid lowers grid constraints.

> *Embed: Pawel Czyzak — "Data center flexibility (intro)"
> · paczyzak.substack.com · 13 days ago*
> https://paczyzak.substack.com/p/data-center-flexibility-intro

### "100% renewable" is a PPA statement, not an engineering statement

Solar exposure runs mostly through the [Noor complexes, which are
operated by MASEN](https://www.masen.ma/en/projects). A 500 MW flat
load supplied by 100% renewables can be achieved three ways, and the
announcement doesn't specify which:

1. **Virtual PPA.** Enough renewable certificates to match the data
   center's annual consumption. Cheap; accountable on paper; does
   nothing for the grid at 3am on a windless December night.
2. **Dedicated new-build plus storage.** A purpose-sized renewable
   project (wind + PV + BESS) sized around 1.2–1.5 GW of renewables
   nameplate to deliver 500 MW firm, with a battery layer covering
   the low-insolation hours. Expensive; takes 3–5 years; requires
   land (quite tough next to dense Casablanca region) and grid access.
3. **Grid-averaged with imports.** Morocco leans on its [1.4 GW
   interconnection with Spain](https://www.entsoe.eu/data/map/) to
   balance intermittency, treating Iberian hydro as the firming layer.
   This works mechanically but compromises the "100% renewable" claim
   unless the imports themselves are certified green.

### The three grid-planning questions nobody is asking

**One.** Where are the grid reinforcements at the Nouaceur node? ONEE's
published PDITE (Plan Directeur des Infrastructures de Transport
Électrique) to 2027 does not earmark transmission buildout for a 500
MW flat injection point on the Casablanca southern ring.

**Two.** What is the PPA structure, and who bears the intermittency
risk? It needs to build storage or buy imports.

**Three.** How does this interact with the OCP electricity demand
curve? OCP operates roughly 1 GW of flat industrial load in the Safi
and Jorf Lasfar phosphate corridors, and has [publicly committed to
full decarbonization](https://www.ocpgroup.ma/sustainability),
including green hydrogen production. A second flat-load archipelago
at Nouaceur, competing for the same renewable electron pool, changes
the priority queue. OCP has been Morocco's implicit anchor customer
for the green industrial transition.

### The counter-argument

Three reasons to be skeptical that any of this matters in the
timeframe the announcement suggests.

First, the phase 1 slip from 40 MW to 16 MW at Q1 2026 is not
encouraging. [Large data center announcements routinely underdeliver](https://www.datacenterdynamics.com/en/news/us-ai-startup-plans-massive-386mw-data-center-in-morocco/)
against their first public timeline, often by 18–24 months.

The chip is the bottleneck — the MW is the loosest constraint in the
system.

### The open question

Morocco has spent a decade building renewable capacity ahead of demand.
Nouaceur is the first test of the inverse: demand arriving faster than
the supply plan.

It's the kind of question I started building
[Energy × Digital Nexus](https://redatahiri37.github.io/morocco-energy-digital-map/)
to help me think through — a small v1 map of Morocco's generation,
grid, industrial loads, and data center pipeline. Working notebook,
not a finished reference. Nouaceur is on it now; corrections,
additions, and disagreements all welcome.

---

### Sources

**Primary reporting on the Nouaceur announcement:**
- [Morocco World News — "Data Center: Mega Project Worth Over 1 Billion MAD Planned in Nouaceur"](https://www.moroccoworldnews.com/2026/04/285780/data-center-mega-project-worth-over-1-billion-mad-planned-in-nouaceur/) (April 2026)
- [Morocco World News — "Nexus Factory Launch at GITEX Africa"](https://www.moroccoworldnews.com/2026/04/286411/nexus-factory-launch-at-gitex-africa-positions-morocco-as-a-future-ai-gateway/) (April 2026)
- [Hespress EN — "Morocco moves closer to giant AI data center near Casablanca"](https://en.hespress.com/135057-morocco-moves-closer-to-giant-ai-data-center-near-casablanca.html) (April 2026)
- [Enterprise AM — "Morocco lines up a bigger AI infrastructure play in Nouaceur"](https://enterpriseam.com/logistics/2026/04/06/morocco-lines-up-a-bigger-ai-infrastructure-play-in-nouaceur/) (April 6, 2026)
- [Yabiladi — "AI data center project in Morocco clears land acquisition hurdle"](https://en.yabiladi.com/articles/details/191563/data-center-project-morocco-clears) (April 2026)
- [Silicon Africa — "Morocco Plans to Host World-Class AI Hub Through Naver–Nvidia Strategic Alliance"](https://siliconafrica.org/morocco-plans-to-host-world-class-ai-hub/) (April 2026)
- [TechAfrica News — "Morocco Launches Nexus AI Factory to Position Itself as Africa's Leading AI Hub"](https://techafricanews.com/2026/04/13/morocco-launches-nexus-ai-factory-to-position-itself-as-africas-leading-ai-hub/) (April 13, 2026)
- [iAfrica — "Morocco Lands $1.2 Billion AI Data Center Project, Beating Out South Africa and Other African Rivals"](https://iafrica.com/morocco-lands-1-2-billion-ai-data-center-project-beating-out-south-africa-and-other-african-rivals/) (April 2026)
- [Data Center Dynamics — "US AI startup plans massive 386 MW data center in Morocco"](https://www.datacenterdynamics.com/en/news/us-ai-startup-plans-massive-386mw-data-center-in-morocco/)

**Grid context and structural data:**
- [IEA — Morocco country profile (electricity)](https://www.iea.org/countries/morocco/electricity)
- [IRENA — Renewable Capacity Statistics 2025](https://www.irena.org/Publications/2025/Mar/Renewable-capacity-statistics-2025)
- [ENTSO-E — European transmission map (Spain–Morocco interconnection)](https://www.entsoe.eu/data/map/)
- [Climate Action Tracker — Morocco](https://climateactiontracker.org/countries/morocco/) (consulted April 2026)
- ONEE — PDITE 2023–2027 (Plan Directeur des Infrastructures de Transport Électrique)
- [MASEN — Projects portfolio](https://www.masen.ma/en/projects)
- TAQA Morocco — annual asset disclosures
- [OCP Group — Sustainability commitments](https://www.ocpgroup.ma/sustainability)

**Related thinking on data center flexibility:**
- [Pawel Czyzak — "Data center flexibility (intro)"](https://paczyzak.substack.com/p/data-center-flexibility-intro), Energy, Extended (April 2026)

*Corrections and pushback welcome, especially from anyone with direct
visibility on the PPA structure or the PDITE update.*
