# Atlas Solar — usage analytics

Before this existed, the tool had **zero** visibility into whether anyone
used it. Every product decision was opinion. This document describes what
is now measured, why each number was chosen, and how to run the loop.

## What is measured, and what question it answers

| Event | Fires when | The question it answers |
|---|---|---|
| `view` | Page loads | How many people show up, from where, on what device |
| `address_input` | First keystroke in the address field | How many *intend* to estimate, vs. bounce off the landing copy |
| `geocode_fail` | Nominatim returns nothing, or errors | How many people we lose at the door because we can't find their address |
| `estimate` | The result view is reached | **Activation.** The number that matters most |
| `pvgis_fallback` | PVGIS is down, approximate mode shown | How often we serve a degraded answer |
| `param_change` | A control is first touched | Which inputs people care about — and which are dead weight |
| `depth` | A section scrolls into view | Whether the financing card and charts earn their space |
| `outcome` | 2.5 s after the numbers settle | **What economics people actually see** — bill, size, payback, savings |
| `exit` | Tab hidden or closed | Furthest step reached + time spent → real drop-off |

`param_change` and `depth` fire at most once per session, so a slider drag
counts as one signal, not four hundred.

## The four numbers to read first

1. **Activation rate** = `estimate` sessions ÷ `view` sessions.
   If this is low, the landing page is the problem, not the calculator.
2. **Geocode failure rate** = `geocode_fail` ÷ `address_input` sessions.
   Every failure is a person who wanted an answer and got a dead end. This
   is the cheapest thing to fix and the most expensive to ignore.
3. **Payback distribution** (`outcome`). If most visitors see 12+ years,
   the tool is telling Moroccans not to buy solar — and either the tariff
   assumptions are wrong or the honest answer is genuinely bad news. Either
   way you need to know which.
4. **PVGIS fallback rate.** Above a few percent, the approximate estimate is
   no longer an edge case and the fallback data deserves real scrutiny.

## The loop

Weekly: run `scripts/solar-stats.sh 7`. Pick the single worst number of the
four. Form one hypothesis. Change one thing. Compare the next week against
this one. Record it in `DAILY_STANDUP.md`'s done log — a metric never
scored against a change is theatre.

Do not read the coordinate table for traffic volume — read it for **where
demand is that the tool doesn't serve well**. An area with many `estimate`
events and a high `pvgis_fallback` rate is a data problem worth fixing.

## Privacy contract

This is deliberately narrower than most analytics, and matches
`solar/PROMPT.md` ("coarse aggregate only") and the `security-engineer`
brief ("cookieless, no PII").

- **No cookies, no localStorage, no cross-site identifier.**
- The session id is a random token in `sessionStorage`. It dies with the
  tab and exists only to stitch one visit's funnel together.
- **The address a visitor types is never transmitted.** Only coordinates
  rounded to 0.1° (~11 km — city scale in Morocco).
- **No IP is stored.** The request IP is used for the rate limit and
  discarded; it is never written to the dataset.
- The Worker reads a fixed whitelist of keys (`EVENT_BLOBS` /
  `EVENT_DOUBLES`) and a fixed whitelist of event names. Anything else on
  the wire is dropped — a future client bug cannot leak a new field.
- `navigator.doNotTrack` and `globalPrivacyControl` disable collection
  entirely.
- No third party. Events go to our own Worker, on our own account.

`solar/proxy/worker.test.mjs` asserts these guarantees.

## Setup

### 1. Deploy the Worker with the dataset binding

```bash
cd solar/proxy
wrangler deploy
```

The `[[analytics_engine_datasets]]` block in `wrangler.toml` creates the
`solar_events` dataset. If `wrangler` rejects the block, delete it — the
Worker still serves `/e` and silently drops events, so nothing breaks.

### 2. Create a read token for the query script

<https://dash.cloudflare.com/profile/api-tokens> → Create Custom Token →
permission **Account · Account Analytics · Read**.

```bash
export CF_ACCOUNT_ID=<account id>
export CF_API_TOKEN=<token>
scripts/solar-stats.sh 7
```

Keep the token out of the repo. It is read-only, but it is still a credential.

### 3. (Optional) Cloudflare Web Analytics for raw pageviews

The events above deliberately do not duplicate what the edge already knows
(country, bot filtering, Core Web Vitals). Cloudflare Web Analytics is free
and cookieless, and for a Pages project it needs **no code change**:

Dashboard → the `atlas-solar` Pages project → Metrics → enable Web
Analytics. The beacon is injected at the edge.

## Tests

```bash
cd solar/proxy && node worker.test.mjs
```

No framework, no install.
