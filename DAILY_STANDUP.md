# Daily Standup — Atlas Nexus engineering team

> **[COUNCIL.md](./COUNCIL.md) is the constitution. Where this file and the
> Council disagree, the Council wins.**

## Two tracks, deliberately separate

| | Governs | Cadence | Runs under |
|---|---|---|---|
| **Council sitting** | the map — `docs/**` | **every 5 hours**, automated | [COUNCIL.md](./COUNCIL.md) |
| **Solar standup** | Atlas Solar — `solar/**` | as needed, human-led | this file |

The Council has six seats (`frontend-engineer`, `coord-validator`,
`map-debugger`, `map-tester`, `platform-engineer`, `security-engineer`),
chaired by `standup-chair`, and files objectives against the North Star Test.
It authorises **at most 1 SHIP per rolling 24 h** across all sittings, plus up
to 2 read-only REPORTs per sitting. Minutes land in `council/YYYY-MM-DD.md`.

`calc-engine-engineer` and `qa-reliability` are **off-council** — they serve
Atlas Solar only and are never called to a map sitting.

## Goal (Solar track)

Solar engineering agents each propose **3 priorities**; the day is allocated
across **5 one-hour slots**. Most proposals get deferred, with a reason.
That refusal is the point.

Complements [ARCHITECTURE_KANBAN.md](./ARCHITECTURE_KANBAN.md), which picks
one architecture card per day.

## The team

| Agent | Owns | Definition |
|---|---|---|
| `platform-engineer` | Worker, Pages/GH deploys, CI/CD, uptime, caching | [.claude/agents/platform-engineer.md](.claude/agents/platform-engineer.md) |
| `calc-engine-engineer` | PVGIS, ONEE tariffs, ROI model, figure accuracy | [.claude/agents/calc-engine-engineer.md](.claude/agents/calc-engine-engineer.md) |
| `frontend-engineer` | Estimator UX, mobile, a11y, new tools | [.claude/agents/frontend-engineer.md](.claude/agents/frontend-engineer.md) |
| `qa-reliability` | Test coverage, regressions, error paths | [.claude/agents/qa-reliability.md](.claude/agents/qa-reliability.md) |
| `security-engineer` | Secrets, CORS, dependencies, privacy | [.claude/agents/security-engineer.md](.claude/agents/security-engineer.md) |
| `standup-chair` | Runs the meeting, allocates slots | [.claude/agents/standup-chair.md](.claude/agents/standup-chair.md) |

The three existing map agents (`coord-validator`, `map-debugger`,
`map-tester`) stay scoped to the infrastructure map and are pulled in by
name when map work is on the board.

## The day — 5 slots (Europe/Paris)

| Slot | Time | Intent |
|---|---|---|
| 1 | 09:00–10:00 | Hardest / highest-risk work |
| 2 | 10:30–11:30 | Continuation or second deep task |
| 3 | 14:00–15:00 | Build |
| 4 | 15:30–16:30 | Build |
| 5 | 17:00–18:00 | Verify, ship, write up |

**Slot 5 never builds.** It proves and ships what slots 1–4 produced. A day
that fills slot 5 with new work is a day that ships nothing.

## Allocation rules

- A blocking `qa-reliability` **FAIL** or `security-engineer` **BLOCKED**
  takes slot 1 and displaces everything else.
- Max **2 slots per agent per day** — concentration is how a solo project
  ends up with five half-finished branches.
- One slot = **one verifiable deliverable**. Anything larger than 2 slots
  must be split before it can be scheduled.
- Every one of the 15 proposals appears in the plan **or** in the deferred
  list with a reason. Nothing evaporates.

## Prioritization lenses

Applied in order — failing an earlier lens cannot be offset by a later one:

| Lens | Question |
|---|---|
| **Truth** | Is the tool showing anything wrong, unsourced, or misleading? |
| **Trust** | Is anything exposed, leaking, or broken for real users? |
| **Speed** | Does this make the next change faster or safer to ship? |

Score = `impact × urgency ÷ effort`, where impact 5 = users see wrong
numbers / site down / secret exposed, and impact 1 = internal tidiness.

## Running it

Manually, any morning:

```
Use the standup-chair agent to run today's standup.
```

The chair collects from the five agents, scores, allocates, and posts the
plan. To automate it on a schedule, use the `schedule` skill (08:30 Paris,
Mon–Fri) — the same slot the architecture routine already uses.

## Standing backlog (seeded from real gaps, not invented)

These exist today and will keep surfacing until closed:

- **No automated tests on the ROI math.** Zero coverage on the numbers the
  product's credibility rests on. `qa-reliability` proposes this daily.
- **No CI.** Nothing runs on push; deploys are a human typing `wrangler`.
- **No pre-commit secret scan.** Two credential leaks were caught only by
  GitHub's push protection, not by this repo.
- **No analytics.** Zero visibility into whether anyone uses the tool.
- **No error monitoring.** If the Worker starts failing, nobody finds out.
- **Self-consumption ratio is an unvalidated heuristic** — the weakest link
  in an otherwise defensible model.
- **Nominatim rate limit (1 req/s)** is the real scaling ceiling before
  PVGIS is; it is not yet proxied or cached like PVGIS is.

## Done log

Record what actually shipped vs what was planned. A plan never scored
against reality is theatre.

| Date | Planned | Shipped | Slipped |
|---|---|---|---|
| — | — | — | — |
