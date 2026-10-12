# Security

## Reporting a problem

Use GitHub's private reporting: the repository's Security tab › « Report a
vulnerability »
(<https://github.com/redatahiri37/morocco-energy-digital-map/security/advisories/new>).
Please do not post a working exploit or a credential in a public issue.
`solar.wattu.org/.well-known/security.txt` (RFC 9116) points here too.

## What protects the two sites

- **Only first-party code runs.** MapLibre, Leaflet and Chart.js are
  served from each site (`docs/vendor/`, `solar/vendor/`), copied from
  their npm packages, with SRI hashes. No CDN can change or withhold the
  code. `scripts/check-sri.mjs` fails CI if a page loads a script or
  stylesheet from another site, if a vendored file does not match its
  hash, or if a `style=""` attribute or `<style>` block appears.
- **Strict Content-Security-Policy and isolation headers** in
  `docs/_headers` and `solar/_headers` (Cloudflare Pages):
  - scripts and styles from the site only, no `'unsafe-inline'`, no
    `eval`; the map's one inline script is allowed by its hash, which CI
    checks;
  - every other host a page talks to (tiles, Nominatim, Overpass, the
    Worker) is listed, and anything else is refused;
  - no other site can frame the pages, hold a handle on their window or
    embed their files (`frame-ancestors`, `X-Frame-Options`, COOP, CORP);
  - HTTPS only (HSTS), no MIME sniffing, no camera or microphone;
  - on the solar site, every refusal is reported to the Worker (below,
    « Reading the CSP reports »).
- **The solar page never parses a string as HTML**: `app.js` and the
  chat page's `chat/chat.js` (which shows the model's replies) build their
  elements with `textContent` / `createElement`, and `solar.yml` fails if
  `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write`
  appears in them. The chat turns only links to solar.wattu.org and
  taqapro.ma into links; any other address stays text.
- **The map never renders third-party HTML**: its attribution is fixed text,
  numbers from the data are written only if they are numbers, and links
  only if they are http(s). `scripts/validate-countries.mjs` checks the
  same in CI.
- **The Worker** (`solar/proxy/worker.js`) forwards only whitelisted,
  normalised PVGIS parameters to one fixed host, rate-limits per IP even
  without its binding, stores analytics values only when they have the
  expected shape (see `solar/ANALYTICS.md`), keeps CSP reports to
  directive, host and path, and answers CORS only for the Wattu origins
  (no localhost, no github.io). Its chat endpoint (`/chat`, prototype)
  answers only the Wattu origins and the access key (`CHAT_ACCESS_KEY`),
  10 answers a minute per IP, at most 5 model calls per answer; the
  Anthropic API key is a Worker secret, and no message is logged or
  stored. The model's tools only compute (PVGIS, tariff, payback): they
  read nothing private and change nothing.
- **CI**: actions pinned to commit SHAs and kept current by Dependabot
  (`.github/dependabot.yml`), read-only `GITHUB_TOKEN`, gitleaks on every
  push and PR (`.github/workflows/secrets.yml`), deploys from `main` only,
  and `main` changes only through a PR (ruleset below).
- **Pre-commit hook** `.githooks/pre-commit` — enable it once per clone:
  `git config core.hooksPath .githooks`.

## Updating a vendored library

1. Download the package from npm (`npm pack maplibre-gl@X.Y.Z`) and check
   its `shasum` against `npm view maplibre-gl@X.Y.Z dist.shasum`.
2. Copy the `dist` files (and LICENSE) into a new `vendor/<name>-X.Y.Z/`
   folder; delete the old folder.
3. Update the path and the integrity hash in `index.html`:
   `openssl dgst -sha384 -binary <file> | openssl base64 -A`. The solar
   page loads MapLibre from `app.js` (3D view, on click): its path and
   hashes are in `CONFIG.MAPLIBRE_JS` / `MAPLIBRE_CSS` (`engine.js`), which solar.yml
   checks against the files.
4. CI (`check-sri.mjs`) and the map/solar test suites must pass.

## Settings only the owner can change (GitHub and Cloudflare)

- [ ] Two-factor authentication with a passkey or security key on the
      GitHub and Cloudflare accounts. Whoever holds either account can
      replace both sites; no code change can protect against that.
- [ ] DNSSEC on wattu.org (Cloudflare › wattu.org › DNS › Settings ›
      Enable DNSSEC), so nobody can redirect the domain by forging DNS
      answers.
- [ ] Private vulnerability reporting (Settings › Security › Private
      vulnerability reporting › Enable). `security.txt` and « Reporting a
      problem » above point to it; until it is on, the link shows nothing
      to fill in.
- [ ] `solar/.well-known/security.txt` expires on 2027-09-30: set a new
      `Expires` (under a year ahead) before then. `solar.yml` warns in the
      last 60 days and fails once the date has passed.

- [x] 2026-10-08 — ruleset "main" (Settings › Rules › Rulesets) on the
      default branch only: pull request required (0 approvals: the owner
      merges their own PRs), `gitleaks` must pass, no deletion, no
      force-push. Only `gitleaks` is required because the other checks run
      only when their folders change; a required check that never runs
      would block the PR.
- [ ] Cloudflare secrets in the GitHub environment `production`.
      **Not done: accepted risk, owner's decision 2026-10-08.** The secrets
      stay repository secrets, which a workflow pushed on another branch
      than `main` could read. Mitigations: only accounts with write access
      to the repository can push such a workflow; every push and PR is
      scanned by gitleaks; the token should carry only the Pages and
      Workers permissions. The three
      deploy jobs already name `production`, so moving the secrets later
      takes five minutes:
      1. Settings › Environments › `production` › Deployment branches and
         tags: « Selected branches and tags » › add `main`.
      2. Cloudflare › My Profile › API Tokens › the GitHub token › Roll, and
         copy the new value (Cloudflare shows a token only once).
      3. In `production`, add the environment secrets `CLOUDFLARE_API_TOKEN`
         (the new value) and `CLOUDFLARE_ACCOUNT_ID`.
      4. Settings › Secrets and variables › Actions: delete the two
         repository secrets of the same names.
      5. Actions › worker-deploy › Run workflow, to check a deploy works.
      Optional: « Required reviewers » on the environment makes every
      deploy wait for a tap on « Approve ».
- [ ] Enable Dependabot alerts (Settings › Advanced Security). Version
      updates for the actions already run from `.github/dependabot.yml`.
- [x] 2026-10-08 — the Cloudflare API token has
      Account › Workers Scripts › Edit; `worker-deploy` publishes the Worker.
- [ ] Chat assistant (prototype): its two Worker secrets are set from
      `solar/proxy/` with `npx wrangler@4 secret put ANTHROPIC_API_KEY` and
      `npx wrangler@4 secret put CHAT_ACCESS_KEY`, never committed. In the
      Anthropic Console, give the key its own workspace with a monthly
      spend limit. To shut the chat: `npx wrangler@4 secret delete
      CHAT_ACCESS_KEY` (it answers 503). To cut off a shared link: put a
      new `CHAT_ACCESS_KEY` and send the new link.
- [ ] Record here the date (never the value) on which each credential that
      was ever exposed was revoked: the old GitHub PAT, the old Mapbox
      token, and any token pasted into a chat.

## Reading the CSP reports

`solar/_headers` sends the browser's Content-Security-Policy refusals to the
Worker's `/csp`, which writes them to the `solar_csp` Analytics Engine
dataset: directive, what was blocked (a host, or `inline`, `eval`, a scheme
such as `chrome-extension`), the page and the script (host and path, never
the query), the line number. Same read-only token as
`scripts/solar-stats.sh` (`solar/ANALYTICS.md` › Setup):

```bash
curl -sS "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CF_API_TOKEN" --data "
  SELECT blob1 AS directive, blob2 AS blocked, blob5 AS page,
         blob6 AS script_host, blob7 AS script, SUM(_sample_interval) AS reports
  FROM solar_csp WHERE timestamp > NOW() - INTERVAL '7' DAY
  GROUP BY directive, blocked, page, script_host, script ORDER BY reports DESC"
```

Columns: blob1 directive, blob2 blocked host or keyword, blob3 blocked path,
blob4 page host, blob5 page path, blob6 script host, blob7 script path,
blob8 `enforce` or `report`; double1 line number.

How to read it:

- `script_host` = solar.wattu.org (our own file) blocking a host: our code
  needs a host the policy does not list. Add it to `solar/_headers` or
  remove the call.
- `blocked` = `inline` or `eval`, or a host nobody added: something
  injected code into the page, or an edge feature did
  (Cloudflare Web Analytics, Rocket Loader, Email Obfuscation all inject
  scripts). Find which before allowing anything.
- `chrome-extension`, `moz-extension`, `safari-web-extension`: visitors'
  extensions. Noise.

Browsers with the Reporting API (Chrome, Edge) send one batch per page
(`report-to`), the others one request per refusal (`report-uri`); both
count against the Worker's daily quota (below). If they ever eat it, drop
`report-uri` from `solar/_headers` first.

## Accepted risks

- **Cloudflare secrets as repository secrets** (above).
- **Worker quota.** The Worker runs on the Workers Free plan (100,000
  requests a day). A flood from many addresses could use it up for the
  day; the per-IP limit does not stop that. CSP reports count against the
  same quota. The estimator then shows its approximate mode (no PVGIS), it
  does not break. Moving the Worker to a
  route on wattu.org would allow Cloudflare WAF rules if this happens.
- **Chat cost.** Each answer is a paid model call. The access key, the
  per-IP limit and the cap of 5 calls per answer bound it; the Anthropic
  workspace spend limit (above) is the backstop. Whoever has the link can
  use it until the key is changed.
- **Third-party data services** (OpenFreeMap, OpenInfraMap, Nominatim,
  Overpass, PVGIS, Esri tiles) can be slow or down; each failure degrades
  one feature with a message, the pages keep working. They receive the
  visitor's IP, as the footers and the map's methodology say.
- **HSTS without preload.** Preloading would bind every wattu.org
  subdomain to HTTPS for good; decide once all of them are HTTPS-only.
