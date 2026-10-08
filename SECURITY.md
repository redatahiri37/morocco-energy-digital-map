# Security

## Reporting a problem

Open a GitHub issue without the details, or write to the repository owner
through GitHub, and say a private channel is needed. Please do not post a
working exploit or a credential in a public issue.

## What protects the two sites

- **Content-Security-Policy and security headers** in `docs/_headers` and
  `solar/_headers` (Cloudflare Pages). Every host a page talks to is listed
  there; a new tile server, CDN or API must be added or the browser
  refuses it. CI checks that the inline script hash in `docs/_headers`
  matches `docs/index.html`.
- **Pinned CDN libraries with SRI hashes** in both `index.html`.
- **The map never renders third-party HTML**: its attribution is fixed text,
  numbers from the data are written only if they are numbers, and links
  only if they are http(s). `scripts/validate-countries.mjs` checks the
  same in CI.
- **The Worker** (`solar/proxy/worker.js`) forwards only whitelisted,
  normalised PVGIS parameters to one fixed host, rate-limits per IP even
  without its binding, and stores analytics values only when they have the
  expected shape (see `solar/ANALYTICS.md`).
- **CI**: actions pinned to commit SHAs, read-only `GITHUB_TOKEN`, gitleaks
  on every push and PR (`.github/workflows/secrets.yml`), deploys from
  `main` only.
- **Pre-commit hook** `.githooks/pre-commit` — enable it once per clone:
  `git config core.hooksPath .githooks`.

## Settings only the owner can change (GitHub and Cloudflare)

- [x] 2026-10-08 — ruleset "main" (Settings › Rules › Rulesets) on the
      default branch only: pull request required (0 approvals: the owner
      merges their own PRs), `gitleaks` must pass, no deletion, no
      force-push. Only `gitleaks` is required because the other checks run
      only when their folders change; a required check that never runs
      would block the PR.
- [ ] Cloudflare secrets in the GitHub environment `production`. The three
      deploy jobs already name it; until it holds the secrets they fall back
      to the repository secrets. Steps:
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
- [ ] Enable Dependabot alerts and security updates (GitHub Actions).
- [x] 2026-10-08 — the Cloudflare API token has
      Account › Workers Scripts › Edit; `worker-deploy` publishes the Worker.
- [ ] Record here the date (never the value) on which each credential that
      was ever exposed was revoked: the old GitHub PAT, the old Mapbox
      token, and any token pasted into a chat.
