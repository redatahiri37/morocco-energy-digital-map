#!/usr/bin/env python3
"""Atlas telemetry brief — the usage reading, as markdown.

Turns the Analytics Engine event stream into the four numbers that drive a
decision, plus the supporting tables. Written for two consumers:

  * a Council sitting, which pastes it into the minutes, and
  * an email digest, which is the same text.

Both get identical content on purpose — the minutes and the mail must never
disagree about what the week's numbers were.

Usage:
    scripts/telemetry_brief.py [--days 7] [--dataset solar_events]

Environment:
    CF_ACCOUNT_ID, CF_API_TOKEN   (token needs Account Analytics: Read)

Exit codes:
    0  brief produced (including the "not configured" and "no data" briefs —
       these are real, reportable states, not failures)
    2  a query failed
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.cloudflare.com/client/v4/accounts/{acct}/analytics_engine/sql"


def run_sql(acct, token, sql):
    req = urllib.request.Request(
        API.format(acct=acct),
        data=sql.encode("utf-8"),
        headers={"Authorization": "Bearer " + token},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        body = json.load(r)
    if isinstance(body, dict) and body.get("success") is False:
        raise RuntimeError(json.dumps(body.get("errors", body))[:300])
    return body.get("data") or []


def pct(num, den):
    """Rates are meaningless without their denominator, so carry it along."""
    if not den:
        return "n/a"
    return f"{100.0 * num / den:.0f}% ({num}/{den})"


def table(rows, cols, headers):
    if not rows:
        return "_no data_\n"
    out = ["| " + " | ".join(headers) + " |",
           "|" + "|".join(["---"] * len(cols)) + "|"]
    for r in rows:
        out.append("| " + " | ".join(str(r.get(c, "")) for c in cols) + " |")
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--dataset", default="solar_events")
    ap.add_argument("--label", default="Atlas Solar")
    args = ap.parse_args()

    acct = os.environ.get("CF_ACCOUNT_ID")
    token = os.environ.get("CF_API_TOKEN")
    hdr = f"## {args.label} — usage, last {args.days} day(s)\n\n"

    # Not configured is a finding, not an error. Say so precisely, so the
    # reader knows this is a setup gap and not "nobody used the tool".
    if not acct or not token:
        missing = [n for n, v in (("CF_ACCOUNT_ID", acct), ("CF_API_TOKEN", token)) if not v]
        print(hdr + (
            "**Telemetry not configured — no reading available.**\n\n"
            f"Missing: {', '.join('`' + m + '`' for m in missing)}.\n\n"
            "This is a setup gap, *not* evidence that nobody uses the tool. "
            "Until it is closed, every usage question below is unanswerable:\n\n"
            "- activation rate (visitors who reach an estimate)\n"
            "- address lookups that dead-end\n"
            "- how often a degraded (fallback) answer is served\n"
            "- the payback figures visitors actually see\n\n"
            "To close it: deploy the Worker with its Analytics Engine binding "
            "(`cd solar/proxy && wrangler deploy`), then set both variables from "
            "a read-only token. See `solar/ANALYTICS.md`.\n"))
        return 0

    since = f"timestamp > now() - INTERVAL '{args.days}' DAY"
    d = args.dataset

    def q(sql):
        return run_sql(acct, token, sql)

    try:
        stages = {r["stage"]: int(r["sessions"]) for r in q(f"""
            SELECT blob1 AS stage, COUNT(DISTINCT blob2) AS sessions
            FROM {d} WHERE {since} GROUP BY stage""")}

        daily = q(f"""
            SELECT toDate(timestamp) AS day, SUM(_sample_interval) AS views,
                   COUNT(DISTINCT blob2) AS sessions
            FROM {d} WHERE {since} AND blob1 = 'view' GROUP BY day ORDER BY day""")

        refs = q(f"""
            SELECT blob3 AS referrer, COUNT(DISTINCT blob2) AS sessions
            FROM {d} WHERE {since} AND blob1 = 'view'
            GROUP BY referrer ORDER BY sessions DESC LIMIT 8""")

        devices = q(f"""
            SELECT blob4 AS device, COUNT(DISTINCT blob2) AS sessions
            FROM {d} WHERE {since} AND blob1 = 'view'
            GROUP BY device ORDER BY sessions DESC""")

        payback = q(f"""
            SELECT CASE WHEN double9 = 0 THEN 'never (25 yr)'
                        WHEN double9 < 5 THEN '< 5 yr'
                        WHEN double9 < 8 THEN '5-8 yr'
                        WHEN double9 < 12 THEN '8-12 yr'
                        ELSE '12+ yr' END AS payback_band,
                   COUNT(DISTINCT blob2) AS sessions
            FROM {d} WHERE {since} AND blob1 = 'outcome'
            GROUP BY payback_band ORDER BY sessions DESC""")

        controls = q(f"""
            SELECT blob7 AS control, COUNT(DISTINCT blob2) AS sessions
            FROM {d} WHERE {since} AND blob1 = 'param_change'
            GROUP BY control ORDER BY sessions DESC""")

        depth = q(f"""
            SELECT blob8 AS section, COUNT(DISTINCT blob2) AS sessions
            FROM {d} WHERE {since} AND blob1 = 'depth'
            GROUP BY section ORDER BY sessions DESC""")

        places = q(f"""
            SELECT double5 AS lat, double6 AS lon, COUNT(DISTINCT blob2) AS sessions
            FROM {d} WHERE {since} AND blob1 = 'estimate' AND double5 != 0
            GROUP BY lat, lon ORDER BY sessions DESC LIMIT 10""")
    except (urllib.error.URLError, RuntimeError, KeyError, ValueError) as e:
        print(hdr + f"**Query failed.** `{e}`\n\nNo reading this sitting.\n")
        return 2

    views = stages.get("view", 0)
    if not views:
        print(hdr + (
            "**Zero sessions recorded.** The dataset is reachable but empty.\n\n"
            "Either the instrumented build is not live yet, or genuinely nobody "
            "visited in this window. Check the Pages deploy before concluding "
            "the second.\n"))
        return 0

    intent = stages.get("address_input", 0)
    est = stages.get("estimate", 0)
    fails = stages.get("geocode_fail", 0)
    fallback = stages.get("pvgis_fallback", 0)

    print(hdr)
    print("### The four numbers\n")
    print(f"- **Activation** (reached an estimate): {pct(est, views)}")
    print(f"- **Intent → estimate** (typed, then got an answer): {pct(est, intent)}")
    print(f"- **Address dead-ends**: {pct(fails, intent)} of sessions that started typing")
    print(f"- **Degraded answers** (PVGIS fallback): {pct(fallback, est)} of estimates\n")

    print("### Daily\n" + table(daily, ["day", "views", "sessions"], ["Day", "Views", "Sessions"]))
    print("### Payback visitors actually see\n" + table(
        payback, ["payback_band", "sessions"], ["Payback", "Sessions"]))
    print("### Traffic sources\n" + table(refs, ["referrer", "sessions"], ["Referrer", "Sessions"]))
    print("### Devices\n" + table(devices, ["device", "sessions"], ["Device", "Sessions"]))
    print("### Controls tuned\n" + table(controls, ["control", "sessions"], ["Control", "Sessions"]))
    print("### Read depth\n" + table(depth, ["section", "sessions"], ["Section", "Sessions"]))
    print("### Where (coarse, ~11 km)\n" + table(
        places, ["lat", "lon", "sessions"], ["Lat", "Lon", "Sessions"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
