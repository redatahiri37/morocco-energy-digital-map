/* Wattu — the estimator's engine, shared by every place that computes a
 * figure, so they all give the same one:
 *   - the simulator (index.html loads this file before app.js),
 *   - the city pages and guides (scripts/build-solar-cities.mjs),
 *   - the chat assistant (solar/proxy/chat.js, bundled into the Worker).
 *
 *   CONFIG   constants that are easy to update (tariffs, cost, CO2, etc.)
 *   PV       PVGIS 1 kWc response → any size; offline nearest-city fallback
 *   Tariff   ONEE tariff (progressive, then selective): bill ↔ kWh, bill saved
 *   ROI      payback, cashflow, NPV
 *   Finance  loan payment
 *   Sizing   the two sizes worth proposing, the verdict, the break-even
 *   Quote    an installer's quote against the market range
 *   inMorocco
 *
 * Plain script, no import or export: in the page its names are globals
 * that app.js reads; Node and the Worker bundler read module.exports at
 * the bottom. No DOM, no fetch, no text for the page here.
 */

// ── CONFIG ─────────────────────────────────────────
const CONFIG = {
  // ONEE residential LV monthly tranches (TTC).
  // Format: [upper_bound_kWh (Infinity for last), price_MAD_per_kWh_TTC]
  // Source: ONEE / kherba.com/tarifs.
  //
  // How a month is billed (Tariff.billFromKwh):
  //   - up to SELECTIVE_ABOVE_KWH: progressive, each tranche at its price;
  //   - above: « facturation sélective », the WHOLE month at the price of
  //     the tranche reached, with SELECTIVE_TOLERANCE_KWH of grace on each
  //     bound. The distributors' grids print it as 151–210, 211–310,
  //     311–510 and > 510 kWh (Redal grid, 2017 and 2023; ONEE's own
  //     example bills 170 kWh entirely in tranche 3).
  // So one kWh more can reprice the whole month, and solar that brings a
  // home down a tranche saves far more than the kWh it replaces.
  // Not modelled: fixed charges, the TPPAN tax, and the slightly different
  // grids of the regional distributors (SRM, ex Lydec / Redal / Amendis).
  ONEE_TRANCHES: [
    [100, 0.9010],
    [150, 1.0732],
    [200, 1.0732],
    [300, 1.1676],
    [500, 1.3817],
    [Infinity, 1.5958],
  ],
  SELECTIVE_ABOVE_KWH: 150,
  SELECTIVE_TOLERANCE_KWH: 10,
  // A home does not use the same kWh every month, and with selective
  // billing that matters: the same yearly total costs more when some
  // months cross into the next tranche. Month factors (January first,
  // mean 1): more in winter (heating, lighting) and in July–August
  // (cooling), less in spring and autumn. An assumption, ±15 %; without it
  // a bill a few dirhams either side of a threshold would get opposite
  // answers.
  CONSUMPTION_SEASON: [1.15, 1.10, 1.00, 0.90, 0.88, 0.92, 1.05, 1.10, 0.95, 0.90, 0.95, 1.10],

  // Grid emission factor for Morocco (kgCO2/kWh) — ONEE 2024 mix
  CO2_KG_PER_KWH: 0.71,

  // Financial
  DEGRADATION_PCT_YR: 0.005,   // 0.5%/yr module degradation
  TARIFF_INFLATION_YR: 0.02,   // assume 2%/yr tariff drift
  DISCOUNT_RATE: 0.05,         // for NPV
  LIFETIME_YR: 25,
  OPEX_PCT_CAPEX_YR: 0.01,     // 1%/yr O&M as % of capex

  // Consumer financing (indicative — Moroccan bank residential green loan)
  LOAN_APR: 0.06,              // 6% annual
  LOAN_YEARS: 10,

  // Roof layout (building footprint → panels drawn on the map).
  // A 2025 mainstream module: 500 Wc, 1.13 m × 2.28 m (≈ 5.2 m²/kWc).
  // Panels keep ROOF_SETBACK_M from every roof edge
  // (parapet, access). Tilted rows are spaced so a row's shadow at
  // ROW_SHADOW_SUN_ELEV_DEG (≈ winter-noon sun at 30–35°N) misses the next row.
  PANEL_KWP: 0.5,
  PANEL_W_M: 1.13,
  PANEL_L_M: 2.28,
  ROOF_SETBACK_M: 1.0,
  ROW_SHADOW_SUN_ELEV_DEG: 33,
  // Slots laid out at most (200 kWc, 20× the largest home system). A
  // warehouse or a stadium would otherwise draw 100,000+ polygons and
  // freeze the page.
  MAX_PANEL_SLOTS: 400,
  // OpenStreetMap building lookup (Overpass API), radius around the address
  OVERPASS_URL: "https://overpass-api.de/api/interpreter",
  BUILDING_SEARCH_RADIUS_M: 25,

  // 3D view. MapLibre is the energy map's vendored copy, loaded on the
  // first click only, with the same integrity hashes (SECURITY.md). Root
  // paths: /ar/ and /en/ load the same files. Heights are assumptions and
  // the page says so: OpenStreetMap rarely knows a Moroccan house's height.
  MAPLIBRE_JS: { url: "/vendor/maplibre-gl-4.7.1/maplibre-gl.js", sri: "sha384-SYKAG6cglRMN0RVvhNeBY0r3FYKNOJtznwA0v7B5Vp9tr31xAHsZC0DqkQ/pZDmj" },
  MAPLIBRE_CSS: { url: "/vendor/maplibre-gl-4.7.1/maplibre-gl.css", sri: "sha384-MinO0mNliZ3vwppuPOUnGa+iq619pfMhLVUXfC4LHwSCvF9H+6P/KO4Q7qBOYV5V" },
  STOREY_M: 3,           // one storey
  DEFAULT_STOREYS: 2,    // when OpenStreetMap has no building:levels or height
  MAX_STOREYS: 12,
  RACK_FRONT_M: 0.3,     // a panel's low edge above the roof, on its frame

  // Loi 82-21 (décret n° 2.25.100, mars 2026) — surplus injection réseau
  // Cap: 20% de la production annuelle. Tarif LV résidentiel non publié —
  // borne haute prise = tarif MV heures creuses (0,18 MAD/kWh, source pv-magazine 02/2026).
  EXPORT_CAP_PCT: 0.20,
  EXPORT_PRICE_MAD_PER_KWH: 0.18,

  // PVGIS v5.2 is not CORS-enabled — calls go through our Cloudflare Worker
  // (source: solar/proxy/worker.js, ops: solar/README.md "Proxy operations").
  PVGIS_WORKER_URL: "https://solar-pvgis.redatahiri.workers.dev/pvcalc",
  PVGIS_LOSS: 14,              // system losses %
  PVGIS_MOUNTING: "building",  // "building" = rooftop, "free" = ground

  // The simulator's starting point (its sliders: tilt 0–45°, orientation
  // −90° east … 90° west, cost 8–16 MAD/Wc). The city pages and the chat
  // assume the same.
  DEFAULT_ANGLE: 30,           // degrees from horizontal
  DEFAULT_ASPECT: 0,           // 0 = south, −90 = east, 90 = west
  DEFAULT_COST_MAD_PER_WC: 11, // installed, MAD per Wc
  // Installed price range seen on the market (lechantier.ma, May 2026):
  // what a quote is compared with. Up to COST_FAIR_MAD_PER_WC is ordinary.
  COST_LOW_MAD_PER_WC: 8,
  COST_FAIR_MAD_PER_WC: 12,
  COST_HIGH_MAD_PER_WC: 15,

  // Sizes the simulator proposes: MIN to MAX kWc in SIZE_STEP_KW steps.
  SIZE_MIN_KW: 1, SIZE_MAX_KW: 10, SIZE_STEP_KW: 0.5,

  // The verdict on a payback (years): up to GOOD « ça vaut le coup », up to
  // LIMIT « à étudier », beyond « pas encore ». BREAKEVEN is the payback
  // used to say at which price or bill solar starts to make sense.
  PAYBACK_GOOD_YR: 8,
  PAYBACK_LIMIT_YR: 12,
  PAYBACK_BREAKEVEN_YR: 10,
  // « Rentable vite »: the largest size that pays back within this many
  // years of the shortest payback. At a flat price per Wc the very
  // smallest system always wins by a hair; half a year of slack buys a
  // size an installer actually sells.
  QUICK_PAYBACK_SLACK_YR: 0.5,

  // Self-consumption: the share of the production used in the house.
  // One parameter, D = the share of the home's consumption that falls in
  // sunny hours and that panels can therefore serve directly:
  //     self-consumed kWh = D · consumption · (1 − exp(−r / D)),  r = production / consumption
  // A small system is used almost entirely (ratio → 1); a large one can
  // never serve more than D of the consumption (ratio → D / r). With
  // D = 0.33 the curve gives the figures measured on European homes
  // without a battery (≈ 50 % at r = 0.5, ≈ 30 % at r = 1, ≈ 17 % at r = 2).
  // Morocco's production is less seasonal and summer cooling runs in
  // daylight, hence a higher default. Assumptions, not measurements: no
  // public load curves of Moroccan homes exist. The visitor picks one.
  SELF_USE_PROFILES: {
    away: 0.30,   // nobody home on weekdays
    mixed: 0.40,  // default
    home: 0.50,   // someone home, or air conditioning / pool pump in daytime
  },
  DEFAULT_PROFILE: "mixed",
  selfConsumptionRatio(sizingRatio, profile) {
    // mixed: r=0.5 → 0.57, r=0.8 → 0.43, r=1 → 0.37, r=2 → 0.20
    if (!(sizingRatio > 0)) return 1;
    const D = CONFIG.SELF_USE_PROFILES[profile] || CONFIG.SELF_USE_PROFILES[CONFIG.DEFAULT_PROFILE];
    return Math.min(1, (D / sizingRatio) * (1 - Math.exp(-sizingRatio / D)));
  },
};

// ── PV ─────────────────────────────────────────────
// PVGIS is fetched at 1 kWc (app.js through the Worker, the build script
// and the chat directly): PVcalc output is linear in peakpower.
const PV = {
  // Scale the 1 kWc response to an arbitrary system size
  scale(perKw, peakpower) {
    return {
      annualKwh: perKw.yieldPerKw * peakpower,
      specificYield: perKw.yieldPerKw,
      monthlyKwh: perKw.monthlyPerKw.map(m => m * peakpower),
      radiationAnnual: perKw.radiationAnnual,
    };
  },

  // Offline fallback — nearest-city annual yields (kWh/kWc/an, PVGIS values
  // observed at 30° south) so the tool still answers if the proxy or JRC is
  // down. Clearly flagged as approximate in the UI.
  FALLBACK_CITIES: [
    { name: "Casablanca",  lat: 33.57, lon: -7.59, y: 1646 },
    { name: "Rabat",       lat: 34.02, lon: -6.84, y: 1630 },
    { name: "Marrakech",   lat: 31.63, lon: -7.98, y: 1651 },
    { name: "Ouarzazate",  lat: 30.93, lon: -6.94, y: 1818 },
    { name: "Tanger",      lat: 35.76, lon: -5.83, y: 1632 },
    { name: "Agadir",      lat: 30.42, lon: -9.60, y: 1750 },
    { name: "Fès",         lat: 34.03, lon: -5.00, y: 1620 },
    { name: "Oujda",       lat: 34.68, lon: -1.91, y: 1650 },
    { name: "Laâyoune",    lat: 27.15, lon: -13.20, y: 1800 },
    { name: "Errachidia",  lat: 31.93, lon: -4.42, y: 1780 },
  ],
  // Typical Morocco monthly production shape (fractions of the year)
  FALLBACK_SHAPE: [0.072, 0.071, 0.086, 0.089, 0.092, 0.090, 0.096, 0.095, 0.087, 0.081, 0.068, 0.070],

  fallbackPerKw(lat, lon) {
    let best = PV.FALLBACK_CITIES[0], bestD = Infinity;
    for (const c of PV.FALLBACK_CITIES) {
      const d = (c.lat - lat) ** 2 + (c.lon - lon) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    const total = PV.FALLBACK_SHAPE.reduce((a, b) => a + b, 0);
    return {
      yieldPerKw: best.y,
      monthlyPerKw: PV.FALLBACK_SHAPE.map(f => (f / total) * best.y),
      radiationAnnual: null,
      approximate: true,
      referenceCity: best.name,
    };
  },
};

// ── Tariff (ONEE: progressive, then selective) ─────
const Tariff = {
  // Index in ONEE_TRANCHES of the tranche a month of `kwh` is billed in.
  trancheIndex(kwh) {
    const T = CONFIG.ONEE_TRANCHES;
    const tol = kwh > CONFIG.SELECTIVE_ABOVE_KWH ? CONFIG.SELECTIVE_TOLERANCE_KWH : 0;
    for (let i = 0; i < T.length; i++) if (kwh <= T[i][0] + tol) return i;
    return T.length - 1;
  },
  // The tranche's real bounds, tolerance included: { from, to, price }.
  // Selective tranches run 151–210, 211–310, 311–510, 511 and more.
  trancheBounds(i) {
    const T = CONFIG.ONEE_TRANCHES;
    const top = (j) => j < 0 ? 0 : T[j][0] + (T[j][0] > CONFIG.SELECTIVE_ABOVE_KWH ? CONFIG.SELECTIVE_TOLERANCE_KWH : 0);
    return { from: top(i - 1), to: top(i), price: T[i][1] };
  },
  // One month's bill (MAD TTC) for that month's consumption.
  monthBill(kwh) {
    if (!(kwh > 0)) return 0;
    if (kwh > CONFIG.SELECTIVE_ABOVE_KWH) {
      return kwh * CONFIG.ONEE_TRANCHES[Tariff.trancheIndex(kwh)][1];
    }
    let low = 0, bill = 0;
    for (const [upper, price] of CONFIG.ONEE_TRANCHES) {
      bill += (Math.min(kwh, upper) - low) * price;
      if (kwh <= upper) break;
      low = upper;
    }
    return bill;
  },
  // The twelve months of a home that averages `avgKwh` a month.
  months(avgKwh) {
    return CONFIG.CONSUMPTION_SEASON.map(f => avgKwh * f);
  },
  // Average monthly bill (MAD TTC) over the year, for an average monthly
  // consumption: what a visitor means by « ma facture ».
  billFromKwh(avgKwh) {
    return Tariff.months(avgKwh).reduce((a, k) => a + Tariff.monthBill(k), 0) / 12;
  },
  // Average monthly consumption (kWh) from an average monthly bill. The
  // bill rises with consumption, in steps where a month changes tranche:
  // solved by bisection, to the kWh below a step when the bill falls in one
  // (the cautious reading). billFromKwh(kwhFromBill(b)) is b, or just
  // under it at a step.
  kwhFromBill(billMAD) {
    if (!(billMAD > 0)) return 0;
    let lo = 0, hi = billMAD / CONFIG.ONEE_TRANCHES[0][1] + 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (Tariff.billFromKwh(mid) <= billMAD) lo = mid; else hi = mid;
    }
    return lo;
  },
  // What a month's bill drops by when `selfKwh` no longer come from the grid.
  saved(monthKwh, selfKwh) {
    const self = Math.max(0, Math.min(selfKwh, monthKwh));
    return Tariff.monthBill(monthKwh) - Tariff.monthBill(monthKwh - self);
  },
  // Average value of a self-consumed kWh (MAD): the bill saved over the
  // kWh replaced. Above the cheapest tranche's price whenever the solar
  // brings the month down a tranche.
  avoidedCostPerKwh(monthlyConsumptionKwh, monthlyPvKwh) {
    const displaced = Math.max(0, Math.min(monthlyPvKwh, monthlyConsumptionKwh));
    return displaced > 0 ? Tariff.saved(monthlyConsumptionKwh, displaced) / displaced : 0;
  },
};

// ── ROI ────────────────────────────────────────────
const ROI = {
  compute({ pv, monthlyConsumption, capexMAD, exportAllowed, profile }) {
    // pv.monthlyKwh: production per month, kWh
    const annualPv = pv.annualKwh;
    const annualCons = monthlyConsumption * 12;
    const sizingRatio = annualPv / Math.max(annualCons, 1);
    const selfRatio = CONFIG.selfConsumptionRatio(sizingRatio, profile);

    // Month by month: the home's consumption follows CONSUMPTION_SEASON,
    // the self-consumption ratio is the year's (simplification), and each
    // month is billed on what is left to buy.
    const consMonths = Tariff.months(monthlyConsumption);
    let annualSavingsMAD = 0;
    let annualSelfKwh = 0;
    let annualExportableKwh = 0;
    let monthsDownATranche = 0;
    pv.monthlyKwh.forEach((monthKwh, m) => {
      const selfKwh = Math.min(monthKwh * selfRatio, consMonths[m]);
      annualSelfKwh += selfKwh;
      annualExportableKwh += monthKwh - selfKwh;
      annualSavingsMAD += Tariff.saved(consMonths[m], selfKwh);
      // Only where billing is selective: there a lower tranche reprices the whole month.
      if (consMonths[m] > CONFIG.SELECTIVE_ABOVE_KWH &&
          Tariff.trancheIndex(consMonths[m] - selfKwh) < Tariff.trancheIndex(consMonths[m])) monthsDownATranche++;
    });
    const billSavingsMAD = annualSavingsMAD;

    // Loi 82-21: exportable surplus capped at 20% of annual production
    let annualExportKwh = 0, annualExportMAD = 0;
    if (exportAllowed) {
      const cap = annualPv * CONFIG.EXPORT_CAP_PCT;
      annualExportKwh = Math.min(annualExportableKwh, cap);
      annualExportMAD = annualExportKwh * CONFIG.EXPORT_PRICE_MAD_PER_KWH;
      annualSavingsMAD += annualExportMAD;
    }

    const opex = capexMAD * CONFIG.OPEX_PCT_CAPEX_YR;
    const netYear1 = annualSavingsMAD - opex;
    const paybackYr = netYear1 > 0 ? capexMAD / netYear1 : Infinity;

    // 25-yr cashflow with degradation, tariff inflation, opex
    const cashflow = [];
    let cumulative = -capexMAD;
    cashflow.push({ year: 0, net: -capexMAD, cumulative });
    for (let y = 1; y <= CONFIG.LIFETIME_YR; y++) {
      const degrade = Math.pow(1 - CONFIG.DEGRADATION_PCT_YR, y - 1);
      const inflate = Math.pow(1 + CONFIG.TARIFF_INFLATION_YR, y - 1);
      const revenue = annualSavingsMAD * degrade * inflate;
      const net = revenue - opex;
      cumulative += net;
      cashflow.push({ year: y, net, cumulative });
    }
    // NPV
    const npv = cashflow.reduce((acc, c) =>
      acc + c.net / Math.pow(1 + CONFIG.DISCOUNT_RATE, c.year), 0);

    return {
      annualSavingsMAD,
      billSavingsMAD,
      annualSelfKwh,
      annualExportKwh,
      annualExportMAD,
      selfRatio,
      // months of the year billed in a cheaper tranche thanks to the solar
      monthsDownATranche,
      // MAD per self-consumed kWh: what the tranche effect is worth
      selfKwhValueMAD: annualSelfKwh > 0 ? billSavingsMAD / annualSelfKwh : 0,
      paybackYr,
      cashflow,
      npv,
      lifetimeSavingsMAD: cashflow[cashflow.length - 1].cumulative + capexMAD,
    };
  },
};

// ── Finance helper ─────────────────────────────────
const Finance = {
  // Standard annuity payment
  monthlyPayment(principal, apr, years) {
    const n = years * 12;
    const r = apr / 12;
    if (r === 0) return principal / n;
    return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  },
};

// ── Sizing ─────────────────────────────────────────
// Two sizes are worth proposing, and they differ:
//   quick  the shortest payback (within QUICK_PAYBACK_SLACK_YR): a small
//          system, used almost entirely on site;
//   best   the highest net present value over the system's life: more
//          dirhams in the end, repaid more slowly.
// Both between SIZE_MIN_KW and SIZE_MAX_KW, never more than the roof holds.
// `best` is the simulator's, the city pages' and the chat's default.
const Sizing = {
  // Every size with its figures: [{ kw, capex, pv, roi }], smallest first.
  evaluate({ perKw, monthlyKwh, costPerWc = CONFIG.DEFAULT_COST_MAD_PER_WC, roofMaxKw = Infinity, profile, exportAllowed = false }) {
    const step = CONFIG.SIZE_STEP_KW;
    const max = Math.max(CONFIG.SIZE_MIN_KW, Math.min(CONFIG.SIZE_MAX_KW, Math.floor(roofMaxKw / step) * step));
    const out = [];
    for (let kw = CONFIG.SIZE_MIN_KW; kw <= max + 1e-9; kw += step) {
      const pv = PV.scale(perKw, kw);
      const capex = kw * 1000 * costPerWc;
      out.push({ kw, capex, pv, roi: ROI.compute({ pv, monthlyConsumption: monthlyKwh, capexMAD: capex, exportAllowed, profile }) });
    }
    return out;
  },
  options(args) {
    const all = Sizing.evaluate(args);
    let best = all[0];
    for (const o of all) if (o.roi.npv > best.roi.npv + 1e-6) best = o;
    const shortest = Math.min(...all.map(o => o.roi.paybackYr));
    // Largest size about as quick as the quickest, never above `best`
    // (a longer payback for less value is not worth proposing).
    let quick = all[0];
    for (const o of all) {
      if (o.kw <= best.kw && o.roi.paybackYr <= shortest + CONFIG.QUICK_PAYBACK_SLACK_YR) quick = o;
    }
    return { quick, best, all };
  },
  // "go" | "maybe" | "wait" for a payback in years.
  verdict(paybackYr) {
    if (paybackYr <= CONFIG.PAYBACK_GOOD_YR) return "go";
    if (paybackYr <= CONFIG.PAYBACK_LIMIT_YR) return "maybe";
    return "wait";
  },
  // Installed price (MAD/Wc) at which this option pays back in `years`:
  // payback = capex / (savings − opex·capex)  ⇒  capex = savings·T / (1 + opex·T).
  breakEvenCostPerWc(option, years = CONFIG.PAYBACK_BREAKEVEN_YR) {
    const capex = option.roi.annualSavingsMAD * years / (1 + CONFIG.OPEX_PCT_CAPEX_YR * years);
    return capex / (option.kw * 1000);
  },
  // Smallest monthly bill (MAD, 25 MAD steps up to 3,000) whose quickest
  // option pays back in `years` at this price; null when none does.
  breakEvenBill({ perKw, costPerWc, profile, years = CONFIG.PAYBACK_BREAKEVEN_YR }) {
    for (let bill = 100; bill <= 3000; bill += 25) {
      const { quick } = Sizing.options({ perKw, monthlyKwh: Tariff.kwhFromBill(bill), costPerWc, profile });
      if (quick.roi.paybackYr <= years) return bill;
    }
    return null;
  },
  panels(kw) {
    return Math.ceil(kw / CONFIG.PANEL_KWP - 1e-9);
  },
};

// ── Quote ──────────────────────────────────────────
// An installer's quote against the market range (CONFIG.COST_*):
//   "low"   under the range: ask what is left out (brand, inverter, meter…)
//   "fair"  ordinary
//   "high"  top of the range: ask what justifies it
//   "over"  above anything the sources report
const Quote = {
  check({ kw, priceMAD }) {
    if (!(kw > 0) || !(priceMAD > 0)) return null;
    const perWc = priceMAD / (kw * 1000);
    const level = perWc < CONFIG.COST_LOW_MAD_PER_WC ? "low"
      : perWc <= CONFIG.COST_FAIR_MAD_PER_WC ? "fair"
      : perWc <= CONFIG.COST_HIGH_MAD_PER_WC ? "high" : "over";
    return { perWc, level, vsCentralMAD: priceMAD - kw * 1000 * CONFIG.DEFAULT_COST_MAD_PER_WC };
  },
};

// Morocco, Southern Provinces included.
function inMorocco(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= 20.5 && lat <= 36.1 && lon >= -17.3 && lon <= -0.9;
}

if (typeof module === "object" && module.exports) {
  module.exports = { CONFIG, PV, Tariff, ROI, Finance, Sizing, Quote, inMorocco };
}
