# Next session — Fable 5 handoff prompt

> Copy everything between the `⎯⎯⎯` markers below as your opening message in a new Fable 5 session (`claude --model claude-fable-5`). Fable 5 is a top-tier model on the same lineage as Opus 5, so lean on it for a task that needs both engineering judgment and end-to-end execution.

---

⎯⎯⎯

You are picking up work on **Atlas Solar**, a Morocco-focused residential PV production + ROI estimator that shipped v1 last week. Full product & engineering brief is in `solar/PROMPT.md` — read that first, it explains the mission, target user, principles, model spec, and anti-patterns you must respect.

## Task for this session

Replace the current `corsproxy.io` shim with a **dedicated Cloudflare Worker** that proxies PVGIS. This is called out in `solar/README.md` as the durable long-term fix; it is now the highest-value single change we can make to the module. Ship it end to end.

## Why this matters (do not skip)

- `corsproxy.io` is a public shared shim: no SLA, unknown rate limits, every user's coordinates are routed through a third party we do not control.
- PVGIS is not CORS-enabled by design — the Cloudflare Worker becomes the *architectural boundary* between the static Atlas Nexus site and the JRC upstream. Once it exists, we can:
  1. **Cache** PVGIS responses at the edge, keyed by `(lat, lon, kWp, tilt, azimuth)`. Same location + params returns instantly, hits JRC ~10% as often.
  2. **Rate-limit** per-IP so a runaway loop cannot get us banned by JRC.
  3. **Log** aggregate usage without touching PII, to inform the roadmap.
  4. **Fail gracefully** with a French-language JSON error when JRC is down (currently we surface a raw exception).
- Cloudflare Workers free tier is 100k requests/day. Ample for launch traffic.

## What "done" looks like

1. A Worker script at `solar/proxy/worker.js` (source in the repo, so it is versioned and reviewable). ~50–80 lines, no dependencies.
2. `wrangler.toml` in `solar/proxy/` with the Worker name, entry, and route/subdomain config.
3. Endpoint contract:
   - **URL.** `https://solar-pvgis.<user-subdomain>.workers.dev/pvcalc`
   - **Method.** GET
   - **Query params.** Pass-through of what `PVGIS.fetch` in `solar/app.js` already sends (lat, lon, peakpower, loss, angle, aspect, mountingplace, outputformat). Reject anything else.
   - **Response.** JRC JSON body verbatim, plus `access-control-allow-origin` restricted to `https://redatahiri37.github.io` and `http://localhost:8765` (dev).
   - **Cache.** `cf: { cacheTtl: 86400, cacheEverything: true }` (24 h). PVGIS climatology does not change day to day.
   - **Error mapping.** JRC 4xx/5xx → return `{"error": "<french message>", "status": <code>}` with the same status code. Timeout at 15 s → `{"error": "PVGIS ne répond pas", "status": 504}`.
   - **Rate limit.** Use Cloudflare's built-in `cf.rateLimit` binding: 60 req/min/IP. Excess → 429.
4. Update `solar/app.js`:
   - `CONFIG.PVGIS_ORIGIN` → the Worker URL.
   - `CONFIG.PVGIS_PROXY` → `""` (removed).
   - The `PVGIS.fetch` function should be simplified so it constructs `${PVGIS_ORIGIN}?${params}` directly, no more `encodeURIComponent` proxy wrapper.
   - Error handling reads the new `{error, status}` shape and shows the French message inline.
5. Update `solar/README.md`:
   - Remove the "TODO: replace corsproxy.io" section.
   - Add a "Proxy operations" section explaining how to deploy (`wrangler deploy`), rotate the subdomain, check logs (`wrangler tail`).
6. Update `solar/PROMPT.md` §11.6 (Roadmap hooks) — mark this item as done, move it out of the roadmap.
7. Verify end-to-end locally:
   - Start the preview server, click each city chip (Casablanca · Marrakech · Ouarzazate · Rabat · Tanger), confirm KPIs render.
   - Repeat a city — second call should be visibly instant (edge cache hit) once deployed.
   - Break the JRC URL in the worker temporarily to confirm the French error path renders.
8. Commit + prepare a `git push` for the user (Keychain auth — the user pushes themselves, do not attempt).

## Constraints

- **Do NOT modify any file outside `solar/`.** The main Atlas Nexus map at `/` is not your concern.
- **Do NOT introduce a build step.** Worker is deployed via `wrangler`, but the static site remains build-free.
- **Do NOT add analytics that key on user identity or IP** — coarse aggregates only, and only if trivial to add without a datastore.
- **Do NOT change model assumptions** (ONEE tranches, cost, degradation, export cap) as a side effect. If you notice something wrong, flag it separately.
- **The user does not have `wrangler` installed.** They will run the deploy command themselves after you write the config. Give them the exact 3-line install + deploy sequence.

## User's Cloudflare setup — walk them through this at the start

The user does **not** yet have a Cloudflare account. Do NOT ask them to create one manually. Cloudflare's signup accepts **GitHub OAuth**, which is the path we use:

1. Open https://dash.cloudflare.com/sign-up
2. Click "Sign in with GitHub" (bottom of the form). The user's `redatahiri37` GitHub identity is enough — no separate password, no credit card, no domain purchase.
3. Confirm the email Cloudflare sends. Done — free "Workers Free" plan is active.

Only **after** the account exists, run:

```bash
npm install -g wrangler
wrangler login          # opens a browser tab, one click to authorize
```

Custom subdomain (e.g. `pvgis.atlas-nexus.ma`) is out of scope for v1 — use the default `<name>.<user-subdomain>.workers.dev`. The user can point a custom domain later without redeploying.

If Cloudflare's UI has changed since this brief was written, do not improvise account setup — pause, tell the user what you see, and let them navigate the signup themselves. Never enter credentials on their behalf.

## Verification checklist

Run `solar/PROMPT.md` §9 in full. Additionally:

- Network tab shows one request per unique (lat, lon, kWp, tilt, azimuth) tuple. Slider debounce still working.
- `curl -I <worker-url>/pvcalc?lat=33.57&lon=-7.59&peakpower=3&angle=30&aspect=0` returns 200 with `access-control-allow-origin` and `cache-control` headers.
- A second identical curl returns `cf-cache-status: HIT`.
- A malformed request (`?peakpower=abc`) returns a 400 with the French error JSON, not a raw JRC error page.

## Deliverable format

At the end of your session, produce:
1. A one-paragraph summary of what was built and what the user needs to run.
2. The exact `wrangler` commands the user must execute, in a `bash` code block.
3. The commit SHA and message of the local commit (do not push).

⎯⎯⎯

## Why Fable 5 is the right model for this

- **Multi-file coordination** — Worker + wrangler config + client refactor + docs update all need to stay consistent. Fable 5's long-context reasoning shines here.
- **Systems judgment** — cache TTL, rate limits, error shapes, CORS scope, all involve small tradeoffs where a lesser model would either over-engineer or ship something naive.
- **French-language error copy** — user-visible strings need to feel native. Fable 5 handles this cleanly.

## What to do *after* this task (roadmap teaser for the session after)

If time permits or the user wants to keep going:

1. **Sensitivity view** (`solar/PROMPT.md` §11 candidate). Tornado chart showing how each input variable moves the payback. High-impact for the "policy researcher" persona.
2. **Arabic language toggle** (`§11.4`). RTL layout is the interesting part.
3. **PDF export** (`§11.3`). `window.print()` + a dedicated print stylesheet.

Do NOT bundle these into the CF Worker session. One task per session.
