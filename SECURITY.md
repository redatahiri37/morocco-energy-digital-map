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

- [ ] Branch protection on `main`: require a pull request and the checks
      `validate`, `check` and `gitleaks`; block force-pushes.
- [ ] Move `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` into a GitHub
      environment `production` with a required reviewer, then add
      `environment: production` to both deploy jobs.
- [ ] Enable Dependabot alerts and security updates (GitHub Actions).
- [ ] Give the Cloudflare API token the permission
      Account › Workers Scripts › Edit (Cloudflare dashboard › My Profile ›
      API Tokens), so `worker-deploy` can publish the Worker.
- [ ] Record here the date (never the value) on which each credential that
      was ever exposed was revoked: the old GitHub PAT, the old Mapbox
      token, and any token pasted into a chat.
