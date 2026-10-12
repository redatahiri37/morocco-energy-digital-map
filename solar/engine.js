/* Wattu — the estimator's engine, shared by every place that computes a
 * figure, so they all give the same one:
 *   - the simulator (index.html loads this file before app.js),
 *   - the city pages and guides (scripts/build-solar-cities.mjs),
 *   - the chat assistant (solar/proxy/chat.js, bundled into the Worker).
 *
 *   CONFIG   constants that are easy to update (tariffs, cost, CO2, etc.)
 *   PV       PVGIS 1 kWc response → any size; offline nearest-city fallback
 *   Tariff   ONEE stepped tariff: bill ↔ kWh, avoided cost per kWh
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
  // Source: ONEE / kherba.com/tarifs. Selective billing above 150 kWh/mo.
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
  // Average avoided cost given a monthly consumption profile
  // We compute the marginal blend: the PV displaces the TOP tranches first.
  avoidedCostPerKwh(monthlyConsumptionKwh, monthlyPvKwh) {
    // How much of the consumption sits in each tranche
    const tranches = CONFIG.ONEE_TRANCHES;
    let remaining = monthlyConsumptionKwh;
    let low = 0;
    const consumedByTranche = []; // {price, kwh}
    for (const [upper, price] of tranches) {
      const span = Math.max(0, Math.min(upper, monthlyConsumptionKwh) - low);
      consumedByTranche.push({ price, kwh: span });
      low = upper;
      if (upper >= monthlyConsumptionKwh) break;
    }
    // PV displaces from the TOP tranche down
    let pvRemaining = Math.min(monthlyPvKwh, monthlyConsumptionKwh);
    let totalAvoidedMAD = 0;
    for (let i = consumedByTranche.length - 1; i >= 0 && pvRemaining > 0; i--) {
      const take = Math.min(consumedByTranche[i].kwh, pvRemaining);
      totalAvoidedMAD += take * consumedByTranche[i].price;
      pvRemaining -= take;
    }
    const displaced = Math.min(monthlyPvKwh, monthlyConsumptionKwh);
    return displaced > 0 ? totalAvoidedMAD / displaced : 0;
  },

  // Monthly consumption (kWh) from a monthly bill (MAD TTC): the progressive
  // tranches make the bill piecewise-linear, solved segment by segment
  // (block-rate quirk below 150 kWh ignored, so the inverse stays monotonic).
  kwhFromBill(billMAD) {
    let low = 0, costAtLow = 0;
    for (const [upper, price] of CONFIG.ONEE_TRANCHES) {
      const costAtUpper = upper === Infinity
        ? Infinity
        : costAtLow + (upper - low) * price;
      if (billMAD <= costAtUpper) {
        return low + (billMAD - costAtLow) / price;
      }
      low = upper;
      costAtLow = costAtUpper;
    }
    return low;
  },

  // Monthly bill (MAD TTC) for a monthly consumption, with the same
  // tranches and the same simplification: kwhFromBill(billFromKwh(k)) === k.
  billFromKwh(kwh) {
    let low = 0, bill = 0;
    for (const [upper, price] of CONFIG.ONEE_TRANCHES) {
      bill += (Math.min(kwh, upper) - low) * price;
      if (kwh <= upper) break;
      low = upper;
    }
    return bill;
  },
};

// ── ROI ────────────────────────────────────────────
const ROI = {
  compute({ pv, monthlyConsumption, capexMAD, exportAllowed }) {
    // pv.monthlyKwh: production per month, kWh
    const annualPv = pv.annualKwh;
    const annualCons = monthlyConsumption * 12;
    const sizingRatio = annualPv / Math.max(annualCons, 1);
    const selfRatio = CONFIG.selfConsumptionRatio(sizingRatio);

    // Monthly split — assume same self-consumption ratio across months (simplification)
    let annualSavingsMAD = 0;
    let annualSelfKwh = 0;
    let annualExportableKwh = 0;

    for (const monthKwh of pv.monthlyKwh) {
      const selfKwh = monthKwh * selfRatio;
      const surplusKwh = monthKwh - selfKwh;
      annualSelfKwh += selfKwh;
      annualExportableKwh += surplusKwh;

      // Avoided grid cost = displaced top tranches
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
