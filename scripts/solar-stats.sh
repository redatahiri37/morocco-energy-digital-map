#!/usr/bin/env bash
# Atlas Solar — usage report from the Analytics Engine dataset.
#
# Answers the questions that actually feed a product decision:
#   who shows up, where from, on what device, how far they get, where they
#   fall out, what they tune, and what economics they end up seeing.
#
# Setup (once):
#   export CF_ACCOUNT_ID=<your Cloudflare account id>
#   export CF_API_TOKEN=<API token with "Account Analytics: Read">
#     → https://dash.cloudflare.com/profile/api-tokens (Create Custom Token)
#
# Usage:
#   scripts/solar-stats.sh          # last 7 days
#   scripts/solar-stats.sh 30       # last 30 days
#   scripts/solar-stats.sh 7 raw    # print each result as raw JSON
#
# Note on counts: Analytics Engine samples under load, so every count is
# SUM(_sample_interval), never COUNT(). Using COUNT() would undercount.

set -euo pipefail

DAYS="${1:-7}"
FORMAT="${2:-table}"
DATASET="solar_events"

: "${CF_ACCOUNT_ID:?set CF_ACCOUNT_ID}"
: "${CF_API_TOKEN:?set CF_API_TOKEN}"

API="https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/analytics_engine/sql"
SINCE="timestamp > now() - INTERVAL '${DAYS}' DAY"

# Column map, kept in sync with worker.js EVENT_BLOBS / EVENT_DOUBLES.
#   blob1 event   blob2 session  blob3 referrer  blob4 device
#   blob5 lang    blob6 src      blob7 field     blob8 section
#   double1 t(s)  double2 width  double3 step    double4 duration(s)
#   double5 lat   double6 lon    double7 bill    double8 kwp
#   double9 payback(yr)          double10 savings(MAD/yr)

q() {
  local title="$1" sql="$2"
  echo
  echo "── ${title} ─────────────────────────────────────────" | cut -c1-72
  local resp
  resp=$(curl -sS "$API" -H "Authorization: Bearer ${CF_API_TOKEN}" --data "$sql")

  if echo "$resp" | grep -q '"success":false'; then
    echo "  query failed: $(echo "$resp" | head -c 300)"
    return
  fi
  if [ "$FORMAT" = "raw" ]; then
    echo "$resp" | python3 -m json.tool
    return
  fi
  echo "$resp" | python3 -c '
import sys, json
try:
    rows = json.load(sys.stdin).get("data") or []
except Exception:
    print("  (unparseable response)"); sys.exit()
if not rows:
    print("  no data yet"); sys.exit()
cols = list(rows[0].keys())
w = [max(len(c), *(len(str(r[c])) for r in rows)) for c in cols]
print("  " + "  ".join(c.ljust(w[i]) for i, c in enumerate(cols)))
print("  " + "  ".join("-" * w[i] for i in range(len(cols))))
for r in rows:
    print("  " + "  ".join(str(r[c]).ljust(w[i]) for i, c in enumerate(cols)))
'
}

echo "Atlas Solar — last ${DAYS} day(s)"

q "Daily traffic" "
SELECT toDate(timestamp) AS day,
       SUM(_sample_interval) AS views,
       COUNT(DISTINCT blob2) AS sessions
FROM ${DATASET}
WHERE ${SINCE} AND blob1 = 'view'
GROUP BY day ORDER BY day"

q "Funnel (sessions reaching each stage)" "
SELECT blob1 AS stage, COUNT(DISTINCT blob2) AS sessions
FROM ${DATASET}
WHERE ${SINCE} AND blob1 IN ('view','address_input','estimate','param_change','depth','outcome')
GROUP BY stage ORDER BY sessions DESC"

q "How visitors start an estimate" "
SELECT blob6 AS entry_point, COUNT(DISTINCT blob2) AS sessions
FROM ${DATASET}
WHERE ${SINCE} AND blob1 = 'estimate'
GROUP BY entry_point ORDER BY sessions DESC"

q "Friction — failed address lookups" "
SELECT blob6 AS reason, SUM(_sample_interval) AS failures,
       COUNT(DISTINCT blob2) AS sessions_affected
FROM ${DATASET}
WHERE ${SINCE} AND blob1 = 'geocode_fail'
GROUP BY reason ORDER BY failures DESC"

q "Reliability — PVGIS fallbacks (approximate mode shown)" "
SELECT toDate(timestamp) AS day, SUM(_sample_interval) AS fallbacks,
       COUNT(DISTINCT blob2) AS sessions_affected
FROM ${DATASET}
WHERE ${SINCE} AND blob1 = 'pvgis_fallback'
GROUP BY day ORDER BY day"

q "Where the estimates are (coarse, ~11 km)" "
SELECT double5 AS lat, double6 AS lon, COUNT(DISTINCT blob2) AS sessions
FROM ${DATASET}
WHERE ${SINCE} AND blob1 = 'estimate' AND double5 != 0
GROUP BY lat, lon ORDER BY sessions DESC LIMIT 20"

q "Traffic sources" "
SELECT blob3 AS referrer, COUNT(DISTINCT blob2) AS sessions
FROM ${DATASET}
WHERE ${SINCE} AND blob1 = 'view'
GROUP BY referrer ORDER BY sessions DESC LIMIT 20"

q "Devices" "
SELECT blob4 AS device, COUNT(DISTINCT blob2) AS sessions
FROM ${DATASET}
WHERE ${SINCE} AND blob1 = 'view'
GROUP BY device ORDER BY sessions DESC"

q "Which controls people actually tune" "
SELECT blob7 AS control, COUNT(DISTINCT blob2) AS sessions
FROM ${DATASET}
WHERE ${SINCE} AND blob1 = 'param_change'
GROUP BY control ORDER BY sessions DESC"

q "How far down the page people read" "
SELECT blob8 AS section, COUNT(DISTINCT blob2) AS sessions
FROM ${DATASET}
WHERE ${SINCE} AND blob1 = 'depth'
GROUP BY section ORDER BY sessions DESC"

q "Drop-off — furthest step reached, and time spent" "
SELECT double3 AS furthest_step,
       COUNT(DISTINCT blob2) AS sessions,
       ROUND(AVG(double4)) AS avg_seconds,
       ROUND(MAX(double4)) AS max_seconds
FROM ${DATASET}
WHERE ${SINCE} AND blob1 = 'exit'
GROUP BY furthest_step ORDER BY furthest_step"

q "Time to first estimate (seconds from page load)" "
SELECT ROUND(AVG(double1)) AS avg_s, ROUND(MIN(double1)) AS min_s, ROUND(MAX(double1)) AS max_s
FROM ${DATASET}
WHERE ${SINCE} AND blob1 = 'estimate'"

q "Economics visitors settle on — bill bucket vs result" "
SELECT FLOOR(double7 / 250) * 250 AS bill_bucket_mad,
       COUNT(DISTINCT blob2) AS sessions,
       ROUND(AVG(double8), 1) AS avg_kwc,
       ROUND(AVG(double9), 1) AS avg_payback_yr,
       ROUND(AVG(double10)) AS avg_savings_mad_yr
FROM ${DATASET}
WHERE ${SINCE} AND blob1 = 'outcome' AND double7 > 0
GROUP BY bill_bucket_mad ORDER BY bill_bucket_mad"

q "Payback distribution — is the answer good news or bad news?" "
SELECT CASE
         WHEN double9 = 0 THEN 'never (25 yr)'
         WHEN double9 < 5 THEN '< 5 yr'
         WHEN double9 < 8 THEN '5-8 yr'
         WHEN double9 < 12 THEN '8-12 yr'
         ELSE '12+ yr'
       END AS payback_band,
       COUNT(DISTINCT blob2) AS sessions
FROM ${DATASET}
WHERE ${SINCE} AND blob1 = 'outcome'
GROUP BY payback_band ORDER BY sessions DESC"

echo
