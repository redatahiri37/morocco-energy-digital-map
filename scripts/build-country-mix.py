#!/usr/bin/env python3
"""
Build each country's national electricity mix from Ember's yearly data.

  python3 scripts/build-country-mix.py            # every country below
  python3 scripts/build-country-mix.py morocco    # one or more keys

Writes docs/data/<key>/mix.json: generation (TWh, %) and capacity (GW) by
fuel for the latest year Ember has generation for, with total generation,
demand, net imports and CO2 intensity. The map draws it as the "Electricity
mix" bar: the country's real production, which the plant layers alone can't
give (they are capacity, and incomplete).

Ember, "Yearly electricity data" (CC BY 4.0), compiled from national
statistics, EIA, IRENA and Ember's own estimates for the latest year.

Rules
  - Ember's fuels map onto the map's fuel colours; "Other Fossil" (mostly oil
    and diesel) draws as oil, "Other Renewables" (mostly geothermal) as
    geothermal. The label keeps Ember's wording.
  - A fuel that makes at least GAP_PCT of generation but has no capacity in
    the source is listed in `capacity_gaps` (Kenya: geothermal), and the map
    says the capacity view is incomplete instead of drawing it as zero.

Ember replaces the file in place on each release, so the hash below pins the
release the published files were built from. To refresh: delete
scripts/.cache/ember-yearly.csv, rerun, check the diff of the mix.json files,
then update EMBER_SHA256 and EMBER_RELEASE together.

Standard library only; the download is cached in scripts/.cache/ (git-ignored).
"""
import csv
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("od", Path(__file__).with_name("build-country-open-data.py"))
od = importlib.util.module_from_spec(spec)
spec.loader.exec_module(od)

EMBER_URL = ("https://storage.googleapis.com/emb-prod-bkt-publicdata/public-downloads/"
             "yearly_full_release_long_format.csv")
EMBER_HOME = "https://ember-energy.org/data/yearly-electricity-data/"
EMBER_RELEASE = "2026-06-23"
EMBER_SHA256 = "259e1095ee8ffeaf0aff37ad557916ae1823a2da13312da50ba4cec6b4574c3b"
od.SHA256["ember-yearly.csv"] = EMBER_SHA256

# Map key (countries.config.js) → ISO 3166-1 alpha-3, as Ember labels areas.
COUNTRIES = {
    "morocco": "MAR", "cote-divoire": "CIV", "egypt": "EGY", "ethiopia": "ETH",
    "ghana": "GHA", "kenya": "KEN", "nigeria": "NGA", "rwanda": "RWA",
    "senegal": "SEN", "south-africa": "ZAF", "france": "FRA", "spain": "ESP",
}

# Ember fuel → (map fuel key, label). Order is the bar's order: fossil, then
# nuclear, then renewables, so the low-carbon share reads as one run.
FUELS = [
    ("Coal", "coal", "Coal"),
    ("Gas", "gas", "Gas"),
    ("Other Fossil", "oil", "Oil & other fossil"),
    ("Nuclear", "nuclear", "Nuclear"),
    ("Hydro", "hydro", "Hydro"),
    ("Wind", "wind", "Wind"),
    ("Solar", "solar", "Solar"),
    ("Bioenergy", "biomass", "Bioenergy"),
    ("Other Renewables", "geothermal", "Geothermal & other"),
]
GAP_PCT = 1.0


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def load(path, isos):
    """{(iso3, year): {(category, subcategory, variable, unit): value}}"""
    rows = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["ISO 3 code"] not in isos:
                continue
            key = (r["ISO 3 code"], int(r["Year"]))
            rows.setdefault(key, {})[(r["Category"], r["Subcategory"], r["Variable"], r["Unit"])] = num(r["Value"])
    return rows


def build(key, iso3, rows):
    years = sorted((y for (i, y) in rows if i == iso3), reverse=True)
    year = next((y for y in years
                 if rows[(iso3, y)].get(("Electricity generation", "Total", "Total Generation", "TWh"))), None)
    if year is None:
        sys.exit(f"{key}: no generation data for {iso3} in Ember")
    d = rows[(iso3, year)]
    get = lambda *k: d.get(k)

    fuels, gaps = [], []
    for ember, fuel, label in FUELS:
        twh = get("Electricity generation", "Fuel", ember, "TWh") or 0.0
        pct = get("Electricity generation", "Fuel", ember, "%") or 0.0
        gw = get("Capacity", "Fuel", ember, "GW") or 0.0
        if twh <= 0 and gw <= 0:
            continue
        if pct >= GAP_PCT and gw <= 0:
            gaps.append(fuel)
        fuels.append({"fuel": fuel, "label": label, "generation_twh": round(twh, 2),
                      "generation_pct": round(pct, 1), "capacity_gw": round(gw, 2)})

    cap_total = round(sum(f["capacity_gw"] for f in fuels), 2)
    renew_gw = sum(f["capacity_gw"] for f in fuels if f["fuel"] in ("hydro", "wind", "solar", "biomass", "geothermal"))
    out = {
        "country": key,
        "iso3": iso3,
        "year": year,
        "source": f"Ember, Yearly electricity data (release {EMBER_RELEASE}, CC BY 4.0)",
        "source_url": EMBER_HOME,
        "generation_twh": round(get("Electricity generation", "Total", "Total Generation", "TWh"), 2),
        "demand_twh": get("Electricity demand", "Demand", "Demand", "TWh"),
        "net_imports_twh": get("Electricity imports", "Electricity imports", "Net Imports", "TWh"),
        "co2_intensity_g_per_kwh": get("Power sector emissions", "CO2 intensity", "CO2 intensity", "gCO2/kWh"),
        "renewables_pct_generation": round(get("Electricity generation", "Aggregate fuel", "Renewables", "%") or 0.0, 1),
        "capacity_gw": cap_total,
        # A fuel missing from capacity would skew the share: none rather than wrong.
        "renewables_pct_capacity": round(100 * renew_gw / cap_total, 1) if cap_total and not gaps else None,
        "capacity_gaps": gaps,
        "fuels": fuels,
    }
    path = ROOT / "docs" / "data" / key / "mix.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    top = ", ".join(f"{f['label']} {f['generation_pct']:.0f}%" for f in sorted(fuels, key=lambda f: -f["generation_pct"])[:4])
    print(f"{key:13} {year}  {out['generation_twh']:7.1f} TWh  {cap_total:6.1f} GW  "
          f"RE {out['renewables_pct_generation']:4.1f}% gen  {top}"
          + (f"  capacity gaps: {', '.join(gaps)}" if gaps else ""))


def main():
    keys = sys.argv[1:] or list(COUNTRIES)
    unknown = [k for k in keys if k not in COUNTRIES]
    if unknown:
        sys.exit(f"unknown country key(s): {', '.join(unknown)} (add them to COUNTRIES)")
    rows = load(od.fetch(EMBER_URL, "ember-yearly.csv"), {COUNTRIES[k] for k in keys})
    for k in keys:
        build(k, COUNTRIES[k], rows)


if __name__ == "__main__":
    main()
