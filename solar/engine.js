/* Wattu — the estimator's engine, shared by every place that computes a
 * figure, so they all give the same one:
 *   - the simulator (index.html loads this file before app.js),
 *   - the city pages and guides (scripts/build-solar-cities.mjs),
 *   - the chat assistant (solar/proxy/chat.js, bundled into the Worker).
 *
 *   CONFIG   constants that are easy to update (tariffs, cost, CO2, etc.)
 *   PV       PVGIS 1 kWc response → any size; offline nearest-city fallback
 *   Tariff   ONEE tariff (progressive ≤150 kWh, selective above): bill ↔ kWh,
 *            avoided cost per kWh
 *   ROI      payback, cashflow, NPV
 *   Finance  loan payment
 *   Sizing   the recommended system size for a consumption
 *   inMorocco
 *
 * Plain script, no import or export: in the page its names are globals
 * that app.js reads; Node and the Worker bundler read module.exports at
 * the bottom. No DOM, no fetch, no text for the page here.
 */

// ── CONFIG ─────────────────────────────────────────
const CONFIG = {
  // ONEE residential LV monthly tranches (2025, TTC incl. 18% VAT)
  // Format: [upper_bound_kWh (Infinity for last), price_MAD_per_kWh_TTC]
  // Source: ONEE (one.org.ma, « Tarifs ») / kherba.com/tarifs.
  // Two billing modes (ONEE, reform of 2014):
  //   - up to ONEE_PROGRESSIVE_MAX_KWH a month: progressive, each tranche
  //     at its own price (100 × 0.9010 + the rest × 1.0732);
  //   - above it: « sélective », the WHOLE month at the price of the tranche
  //     reached, with a tolerance of ONEE_SELECTIVE_TOLERANCE_KWH over each
  //     tranche's upper bound (so 151–210 kWh at 1.0732, 211–310 at 1.1676,
  //     311–510 at 1.3817, above 510 at 1.5958).
  // The bill therefore jumps at 150, 210, 310 and 510 kWh, and a solar kWh
  // that brings the month back under a threshold is worth far more than
  // its tranche price: Tariff.avoidedCostPerKwh takes the bill difference.
  ONEE_PROGRESSIVE_MAX_KWH: 150,
  ONEE_SELECTIVE_TOLERANCE_KWH: 10,
  ONEE_TRANCHES: [
    [100, 0.9010],
    [150, 1.0732],
    [200, 1.0732],
    [300, 1.1676],
    [500, 1.3817],
    [Infinity, 1.5958],
  ],

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

  // Auto-sizing: recommend a system covering this share of annual consumption
  AUTOSIZE_COVER: 0.80,

  // How far the self-consumption share may be off, in points, either way.
  // No measured Moroccan household load data exists yet, so the payback is
  // shown as the range this spread gives (ROI.paybackRange), not one figure.
  SELF_RATIO_UNCERTAINTY: 0.10,

  // Self-consumption ratio heuristic — fraction of PV production consumed on-site
  // Function of (annual_production / annual_consumption). Empirical residential curve.
  selfConsumptionRatio(sizingRatio) {
    // sizingRatio = production/consumption
    // r=0.5 → ~0.85, r=1.0 → ~0.55, r=1.5 → ~0.42, r=2.0 → ~0.33
    if (sizingRatio <= 0) return 1;
    return Math.min(1, 0.30 + 0.55 * Math.exp(-0.9 * sizingRatio));
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

// ── Tariff (ONEE stepped) ──────────────────────────
const Tariff = {
  // The tariff as segments of a month's consumption, lowest first. Within
  // a segment the bill is base + rate × kWh; between two segments it jumps.
  //   progressive part: one segment per tranche up to 150 kWh;
  //   selective part:   one segment per tranche reached, whole month at
  //                     its price, upper bound + tolerance.
  segments() {
    const T = CONFIG.ONEE_TRANCHES, max = CONFIG.ONEE_PROGRESSIVE_MAX_KWH;
    const tol = CONFIG.ONEE_SELECTIVE_TOLERANCE_KWH;
    const out = [];
    let low = 0, base = 0;
    for (const [upper, price] of T) {
      if (low >= max) break;
      const hi = Math.min(upper, max);
      out.push({ from: low, to: hi, base: base - low * price, rate: price, mode: "progressive" });
      base += (hi - low) * price;
      low = hi;
    }
    for (const [upper, price] of T) {
      if (upper !== Infinity && upper + tol <= max) continue;
      const to = upper === Infinity ? Infinity : upper + tol;
      out.push({ from: low, to, base: 0, rate: price, mode: "selective" });
      low = to;
    }
    return out;
  },

  // The segment a month's consumption falls in (kWh ≤ its upper bound).
  segmentOf(kwh) {
    const segs = Tariff.segments();
    return segs.find(s => kwh <= s.to) || segs[segs.length - 1];
  },

  // Monthly bill (MAD TTC) for a monthly consumption.
  billFromKwh(kwh) {
    if (!(kwh > 0)) return 0;
    const s = Tariff.segmentOf(kwh);
    return s.base + s.rate * kwh;
  },

  // Price of one more kWh this month, ignoring jumps (MAD/kWh): the
  // tranche price in the progressive part, the price the whole month is
  // billed at in the selective part.
  priceAt(kwh) {
    return Tariff.segmentOf(Math.max(kwh, 0)).rate;
  },

  // Monthly consumption (kWh) from a monthly bill (MAD TTC). The bill only
  // rises with consumption, but it jumps at each threshold: a bill that
  // falls inside a jump (no consumption gives exactly that amount) maps to
  // the threshold below it. kwhFromBill(billFromKwh(k)) === k.
  kwhFromBill(billMAD) {
    if (!(billMAD > 0)) return 0;
    for (const s of Tariff.segments()) {
      const lo = s.base + s.rate * s.from;
      if (billMAD < lo) return s.from;            // inside the jump below s
      if (s.to === Infinity || billMAD <= s.base + s.rate * s.to) {
        return (billMAD - s.base) / s.rate;
      }
    }
    return 0;
  },

  // Average value of the kWh that solar removes from a month's grid
  // purchases (MAD/kWh): the bill difference over the kWh removed. Under
  // selective billing it exceeds the tranche price whenever the month
  // drops under a threshold (the remaining kWh get the lower price too).
  avoidedCostPerKwh(monthlyConsumptionKwh, monthlyPvKwh) {
    const displaced = Math.min(Math.max(monthlyPvKwh, 0), monthlyConsumptionKwh);
    if (!(displaced > 0)) return 0;
    const saved = Tariff.billFromKwh(monthlyConsumptionKwh) -
      Tariff.billFromKwh(monthlyConsumptionKwh - displaced);
    return saved / displaced;
  },
};

// ── ROI ────────────────────────────────────────────
const ROI = {
  // selfRatioShift moves the self-consumption share by that many points
  // (0.1 = +10 points), clamped to 0–1: how paybackRange tests the curve.
  compute({ pv, monthlyConsumption, capexMAD, exportAllowed, selfRatioShift = 0 }) {
    // pv.monthlyKwh: production per month, kWh
    const annualPv = pv.annualKwh;
    const annualCons = monthlyConsumption * 12;
    const sizingRatio = annualPv / Math.max(annualCons, 1);
    const selfRatio = Math.min(1, Math.max(0,
      CONFIG.selfConsumptionRatio(sizingRatio) + selfRatioShift));

    // Monthly split — assume same self-consumption ratio across months (simplification)
    let annualSavingsMAD = 0;
    let annualSelfKwh = 0;
    let annualExportableKwh = 0;

    for (const monthKwh of pv.monthlyKwh) {
      const selfKwh = monthKwh * selfRatio;
      const surplusKwh = monthKwh - selfKwh;
      annualSelfKwh += selfKwh;
      annualExportableKwh += surplusKwh;

      // Avoided grid cost = the bill difference (selective billing included)
      const avoided = Tariff.avoidedCostPerKwh(monthlyConsumption, selfKwh);
      annualSavingsMAD += selfKwh * avoided;
    }

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
      annualSelfKwh,
      annualExportKwh,
      annualExportMAD,
      selfRatio,
      paybackYr,
      cashflow,
      npv,
      lifetimeSavingsMAD: cashflow[cashflow.length - 1].cumulative + capexMAD,
    };
  },

  // Payback with the self-consumption share SELF_RATIO_UNCERTAINTY lower
  // and higher: { low, high } in years (Infinity when it never pays back).
  paybackRange(args) {
    const d = CONFIG.SELF_RATIO_UNCERTAINTY;
    const a = ROI.compute({ ...args, selfRatioShift: +d }).paybackYr;
    const b = ROI.compute({ ...args, selfRatioShift: -d }).paybackYr;
    return { low: Math.min(a, b), high: Math.max(a, b) };
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
// The size the simulator recommends: AUTOSIZE_COVER of the yearly
// consumption, in 0.5 kWc steps, between 1 and 10 kWc and never more than
// the roof holds (when the roof is known).
const Sizing = {
  targetKw(monthlyKwh, yieldPerKw) {
    return (monthlyKwh * 12 * CONFIG.AUTOSIZE_COVER) / yieldPerKw;
  },
  autoKw(monthlyKwh, yieldPerKw, roofMaxKw = Infinity) {
    const target = Sizing.targetKw(monthlyKwh, yieldPerKw);
    return Math.max(1, Math.min(10, roofMaxKw, Math.max(1, Math.round(target * 2) / 2)));
  },
  panels(kw) {
    return Math.ceil(kw / CONFIG.PANEL_KWP - 1e-9);
  },
};

// Morocco, Southern Provinces included.
function inMorocco(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= 20.5 && lat <= 36.1 && lon >= -17.3 && lon <= -0.9;
}

if (typeof module === "object" && module.exports) {
  module.exports = { CONFIG, PV, Tariff, ROI, Finance, Sizing, inMorocco };
}
