# Security

## Reporting a problem

Open a GitHub issue without the details, or write to the repository owner
through GitHub, and say a private channel is needed. Please do not post a
working exploit or a credential in a public issue.

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
  - HTTPS only (HSTS), no MIME sniffing, no camera or microphone.
- **The map never renders third-party HTML**: its attribution is fixed text,
  numbers from the data are written only if they are numbers, and links
  only if they are http(s). `scripts/validate-countries.mjs` checks the
  same in CI.
- **The Worker** (`solar/proxy/worker.js`) forwards only whitelisted,
  normalised PVGIS parameters to one fixed host, rate-limits per IP even
  without its binding, stores analytics values only when they have the
  expected shape (see `solar/ANALYTICS.md`), and answers CORS only for the
  Wattu origins (no localhost, no github.io).
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
   `openssl dgst -sha384 -binary <file> | openssl base64 -A`.
4. CI (`check-sri.mjs`) and the map/solar test suites must pass.

## Settings only the owner can change (GitHub and Cloudflare)

- [ ] Two-factor authentication with a passkey or security key on the
      GitHub and Cloudflare accounts. Whoever holds either account can
      replace both sites; no code change can protect against that.
- [ ] DNSSEC on wattu.org (Cloudflare › wattu.org › DNS › Settings ›
      Enable DNSSEC), so nobody can redirect the domain by forging DNS
      answers.

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
- [ ] Record here the date (never the value) on which each credential that
      was ever exposed was revoked: the old GitHub PAT, the old Mapbox
      token, and any token pasted into a chat.

## Accepted risks

- **Cloudflare secrets as repository secrets** (above).
- **Worker quota.** The Worker runs on the Workers Free plan (100,000
  requests a day). A flood from many addresses could use it up for the
  day; the per-IP limit does not stop that. The estimator then shows its
  approximate mode (no PVGIS), it does not break. Moving the Worker to a
  route on wattu.org would allow Cloudflare WAF rules if this happens.
- **Third-party data services** (OpenFreeMap, OpenInfraMap, Nominatim,
  Overpass, PVGIS, Esri tiles) can be slow or down; each failure degrades
  one feature with a message, the pages keep working. They receive the
  visitor's IP, as the footers and the map's methodology say.
- **HSTS without preload.** Preloading would bind every wattu.org
  subdomain to HTTPS for good; decide once all of them are HTTPS-only.
