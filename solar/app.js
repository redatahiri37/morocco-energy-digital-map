/* Atlas Solar — Morocco residential PV estimator
 * ------------------------------------------------
 * Modules:
 *   CONFIG        constants that are easy to update (tariffs, cost, CO2, etc.)
 *   Geocoder      Nominatim (OSM) address → {lat, lon, label}
 *   PVGIS         EU JRC PVcalc API → annual + monthly kWh
 *   Tariff        ONEE stepped tariff, avoided cost per kWh
 *   ROI           payback, cashflow, NPV
 *   Sensitivity   one-at-a-time perturbation of each assumption
 *   Tornado       sensitivity chart (plain DOM, no chart lib)
 *   Chart         Chart.js wrappers
 *   Map           Leaflet mini-map
 *   UI            DOM binding, state, transitions
 */

// ── CONFIG ─────────────────────────────────────────
// Values marked TODO(agent) will be confirmed by the research agent.
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

  // Panel physical assumption (for area hint only)
  M2_PER_KWP: 5,               // ~5 m² per kWc

  // Loi 82-21 (décret n° 2.25.100, mars 2026) — surplus injection réseau
  // Cap: 20% de la production annuelle. Tarif LV résidentiel non publié —
  // borne haute prise = tarif MV heures creuses (0,18 MAD/kWh, source pv-magazine 02/2026).
  EXPORT_CAP_PCT: 0.20,
  EXPORT_PRICE_MAD_PER_KWH: 0.18,

  // PVGIS v5.2 is not CORS-enabled — calls go through our Cloudflare Worker
  // (source: solar/proxy/worker.js, ops: solar/README.md "Proxy operations").
  // Paste the URL printed by `wrangler deploy` here. While the placeholder
  // is unchanged, the client falls back to the corsproxy.io shim so the
  // page keeps working pre-deploy.
  PVGIS_WORKER_URL: "https://solar-pvgis.redatahiri.workers.dev/pvcalc",
  PVGIS_FALLBACK_ORIGIN: "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc",
  PVGIS_FALLBACK_PROXY: "https://corsproxy.io/?url=",
  PVGIS_LOSS: 14,              // system losses %
  PVGIS_MOUNTING: "building",  // "building" = rooftop, "free" = ground

  // Auto-sizing: recommend a system covering this share of annual consumption
  AUTOSIZE_COVER: 0.80,

  // Sensitivity ranges — plausible bounds used by the tornado view.
  // Each is a documented interval, not a symmetric ±x % guess. Format
  // [borne_a, borne_b]; the view decides which end is favorable from the
  // computed result, not from the ordering here.
  SENSITIVITY: {
    COST_MAD_PER_WC:  [8.5, 14],     // fourchette marché résidentiel (central 11)
    YIELD_MULT:       [0.85, 1.05],  // ombrage / salissure / écart PVGIS (asymétrique)
    BILL_MULT:        [0.75, 1.25],  // facture réelle vs facture déclarée
    SELF_RATIO_MULT:  [0.75, 1.25],  // heuristique d'autoconsommation (placeholder)
    OPEX_PCT:         [0.005, 0.02], // O&M annuel en % du capex
    TARIFF_INFLATION: [0, 0.04],     // dérive tarifaire ONEE
    DEGRADATION:      [0.003, 0.008],// dégradation modules /an
    DISCOUNT_RATE:    [0.03, 0.08],  // taux d'actualisation
  },

  // Self-consumption ratio heuristic — fraction of PV production consumed on-site
  // Function of (annual_production / annual_consumption). Empirical residential curve.
  selfConsumptionRatio(sizingRatio) {
    // sizingRatio = production/consumption
    // r=0.5 → ~0.85, r=1.0 → ~0.55, r=1.5 → ~0.42, r=2.0 → ~0.33
    if (sizingRatio <= 0) return 1;
    return Math.min(1, 0.30 + 0.55 * Math.exp(-0.9 * sizingRatio));
  },
};

// ── Geocoder (Nominatim) ───────────────────────────
const Geocoder = {
  async search(query) {
    if (!query || query.length < 3) return [];
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("countrycodes", "ma");
    url.searchParams.set("limit", "5");
    url.searchParams.set("addressdetails", "1");
    const res = await fetch(url, {
      headers: { "Accept-Language": "fr" },
    });
    if (!res.ok) throw new Error("Geocoding failed");
    const data = await res.json();
    return data.map(d => ({
      lat: parseFloat(d.lat),
      lon: parseFloat(d.lon),
      label: d.display_name,
      short: this.shortLabel(d),
    }));
  },
  shortLabel(d) {
    const a = d.address || {};
    const parts = [
      a.road || a.pedestrian || a.neighbourhood,
      a.suburb || a.city_district,
      a.city || a.town || a.village || a.county,
    ].filter(Boolean);
    return parts.length ? parts.join(", ") : d.display_name.split(",").slice(0, 2).join(",");
  },
};

// ── PVGIS ──────────────────────────────────────────
// Fetched once per (lat, lon, angle, aspect) at 1 kWc — PVcalc output is
// linear in peakpower, so any system size scales locally with zero network.
const PVGIS = {
  async fetchPerKw({ lat, lon, angle, aspect }) {
    const params = new URLSearchParams({
      lat: lat.toFixed(4),
      lon: lon.toFixed(4),
      peakpower: "1",
      loss: String(CONFIG.PVGIS_LOSS),
      angle: String(angle),
      aspect: String(aspect),
      mountingplace: CONFIG.PVGIS_MOUNTING,
      outputformat: "json",
    });
    const workerConfigured = !CONFIG.PVGIS_WORKER_URL.includes("<");
    const url = workerConfigured
      ? `${CONFIG.PVGIS_WORKER_URL}?${params.toString()}`
      : CONFIG.PVGIS_FALLBACK_PROXY +
        encodeURIComponent(`${CONFIG.PVGIS_FALLBACK_ORIGIN}?${params.toString()}`);
    let res;
    try {
      res = await fetch(url);
    } catch (_) {
      throw new Error("Connexion au service PVGIS impossible — vérifiez votre réseau et réessayez.");
    }
    if (!res.ok) {
      // Worker errors carry { error: "<message fr>", status } — surface the message.
      let message = `PVGIS indisponible (HTTP ${res.status})`;
      try {
        const body = await res.json();
        if (body && body.error) message = body.error;
      } catch (_) { /* non-JSON body — keep generic message */ }
      throw new Error(message);
    }
    const data = await res.json();
    const totals = data?.outputs?.totals?.fixed;
    const monthly = data?.outputs?.monthly?.fixed;
    if (!totals || !monthly) throw new Error("PVGIS: unexpected response");
    return {
      yieldPerKw: totals.E_y,                      // kWh/kWc/year
      monthlyPerKw: monthly.map(m => m.E_m),       // 12 values, kWh/kWc/month
      radiationAnnual: totals["H(i)_y"],           // kWh/m²/year
    };
  },

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
    let best = this.FALLBACK_CITIES[0], bestD = Infinity;
    for (const c of this.FALLBACK_CITIES) {
      const d = (c.lat - lat) ** 2 + (c.lon - lon) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    const total = this.FALLBACK_SHAPE.reduce((a, b) => a + b, 0);
    return {
      yieldPerKw: best.y,
      monthlyPerKw: this.FALLBACK_SHAPE.map(f => (f / total) * best.y),
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

  // Weighted average retail price at a monthly consumption (for display / export)
  averageRetailPrice(monthlyConsumptionKwh) {
    let low = 0, sumMAD = 0;
    for (const [upper, price] of CONFIG.ONEE_TRANCHES) {
      const span = Math.max(0, Math.min(upper, monthlyConsumptionKwh) - low);
      sumMAD += span * price;
      low = upper;
      if (upper >= monthlyConsumptionKwh) break;
    }
    return monthlyConsumptionKwh > 0 ? sumMAD / monthlyConsumptionKwh : 0;
  },

  // Monthly bill (MAD TTC) for a given consumption — progressive tranches,
  // same model as avoidedCostPerKwh (block-rate quirk below 150 kWh ignored
  // for consistency and monotonicity).
  costOf(monthlyConsumptionKwh) {
    let low = 0, sum = 0;
    for (const [upper, price] of CONFIG.ONEE_TRANCHES) {
      const span = Math.max(0, Math.min(upper, monthlyConsumptionKwh) - low);
      sum += span * price;
      low = upper;
      if (upper >= monthlyConsumptionKwh) break;
    }
    return sum;
  },

  // Inverse: monthly consumption (kWh) from a monthly bill (MAD).
  // Piecewise-linear, solved segment by segment.
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

  activeTrancheLabel(monthlyConsumptionKwh) {
    const tranches = CONFIG.ONEE_TRANCHES;
    let low = 0;
    for (const [upper, price] of tranches) {
      if (monthlyConsumptionKwh <= upper) {
        const upperLabel = upper === Infinity ? "∞" : upper;
        return `Tranche ${low}–${upperLabel} kWh · ${price.toFixed(2)} MAD/kWh`;
      }
      low = upper;
    }
    return "";
  },
};

// ── ROI ────────────────────────────────────────────
const ROI = {
  // `assumptions` overrides the CONFIG defaults one key at a time — the hook
  // the sensitivity view uses to perturb a single lever and re-run the exact
  // same model. Omitted keys fall back to CONFIG, so existing callers are
  // unaffected.
  defaults() {
    return {
      degradation: CONFIG.DEGRADATION_PCT_YR,
      tariffInflation: CONFIG.TARIFF_INFLATION_YR,
      discountRate: CONFIG.DISCOUNT_RATE,
      opexPct: CONFIG.OPEX_PCT_CAPEX_YR,
      exportPrice: CONFIG.EXPORT_PRICE_MAD_PER_KWH,
      selfRatioMult: 1,
    };
  },

  compute({ pv, monthlyConsumption, capexMAD, exportAllowed, assumptions }) {
    const A = Object.assign(this.defaults(), assumptions || {});
    // pv.monthlyKwh: production per month, kWh
    const annualPv = pv.annualKwh;
    const annualCons = monthlyConsumption * 12;
    const sizingRatio = annualPv / Math.max(annualCons, 1);
    const selfRatio = Math.min(1, CONFIG.selfConsumptionRatio(sizingRatio) * A.selfRatioMult);

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
      annualExportMAD = annualExportKwh * A.exportPrice;
      annualSavingsMAD += annualExportMAD;
    }

    const opex = capexMAD * A.opexPct;
    const netYear1 = annualSavingsMAD - opex;
    const paybackYr = netYear1 > 0 ? capexMAD / netYear1 : Infinity;

    // 25-yr cashflow with degradation, tariff inflation, opex
    const cashflow = [];
    let cumulative = -capexMAD;
    cashflow.push({ year: 0, net: -capexMAD, cumulative });
    for (let y = 1; y <= CONFIG.LIFETIME_YR; y++) {
      const degrade = Math.pow(1 - A.degradation, y - 1);
      const inflate = Math.pow(1 + A.tariffInflation, y - 1);
      const revenue = annualSavingsMAD * degrade * inflate;
      const net = revenue - opex;
      cumulative += net;
      cashflow.push({ year: y, net, cumulative });
    }

    // NPV
    const npv = cashflow.reduce((acc, c) =>
      acc + c.net / Math.pow(1 + A.discountRate, c.year), 0);

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

// ── Sensitivity ────────────────────────────────────
// One-at-a-time sensitivity: hold the reference case fixed, move a single
// assumption to each end of its plausible range, re-run the *same* model, and
// report the two results. No correlation between levers is modelled — that is
// what a tornado chart is, and the UI says so.
const Sensitivity = {
  // A scenario carries everything ROI needs; each perturbation mutates a clone.
  baseScenario({ perKw, peakpower, costPerWc, bill, exportAllowed }) {
    return {
      perKw, peakpower, costPerWc, bill, exportAllowed,
      yieldMult: 1,
      assumptions: ROI.defaults(),
    };
  },

  clone(sc) {
    return Object.assign({}, sc, { assumptions: Object.assign({}, sc.assumptions) });
  },

  evaluate(sc) {
    const pv = PVGIS.scale(sc.perKw, sc.peakpower);
    if (sc.yieldMult !== 1) {
      pv.annualKwh *= sc.yieldMult;
      pv.specificYield *= sc.yieldMult;
      pv.monthlyKwh = pv.monthlyKwh.map(m => m * sc.yieldMult);
    }
    const roi = ROI.compute({
      pv,
      monthlyConsumption: Tariff.kwhFromBill(sc.bill),
      capexMAD: sc.peakpower * 1000 * sc.costPerWc,
      exportAllowed: sc.exportAllowed,
      assumptions: sc.assumptions,
    });
    return { payback: roi.paybackYr, npv: roi.npv };
  },

  // Each variable: two endpoints of a documented range, applied to a clone.
  // `range` is the human-readable interval shown next to the label.
  variables() {
    const S = CONFIG.SENSITIVITY;
    const pct = v => {
      const x = Math.round(v * 1000) / 10;          // one decimal, no float dust
      return (Number.isInteger(x) ? x.toFixed(0) : x.toFixed(1)).replace(".", ",").replace("-", "\u2212") + " %";
    };
    const mad = v => String(v).replace(".", ",");
    return [
      {
        key: "cost",
        label: "Coût installé",
        range: `${mad(S.COST_MAD_PER_WC[0])} – ${mad(S.COST_MAD_PER_WC[1])} MAD/Wc`,
        ends: S.COST_MAD_PER_WC.map(v => sc => { sc.costPerWc = v; }),
      },
      {
        key: "yield",
        label: "Production réelle",
        range: `${pct(S.YIELD_MULT[0] - 1)} … +${pct(S.YIELD_MULT[1] - 1)} vs PVGIS`,
        ends: S.YIELD_MULT.map(v => sc => { sc.yieldMult = v; }),
      },
      {
        key: "bill",
        label: "Facture mensuelle",
        range: `± 25 % autour de votre saisie`,
        ends: S.BILL_MULT.map(v => sc => { sc.bill = sc.bill * v; }),
      },
      {
        key: "self",
        label: "Part autoconsommée",
        range: "± 25 % autour de l'estimation",
        ends: S.SELF_RATIO_MULT.map(v => sc => { sc.assumptions.selfRatioMult = v; }),
      },
      {
        key: "opex",
        label: "Entretien annuel",
        range: `${pct(S.OPEX_PCT[0])} – ${pct(S.OPEX_PCT[1])} du capex / an`,
        ends: S.OPEX_PCT.map(v => sc => { sc.assumptions.opexPct = v; }),
      },
      {
        key: "inflation",
        label: "Hausse du tarif ONEE",
        range: `${pct(S.TARIFF_INFLATION[0])} – ${pct(S.TARIFF_INFLATION[1])} / an`,
        ends: S.TARIFF_INFLATION.map(v => sc => { sc.assumptions.tariffInflation = v; }),
      },
      {
        key: "degradation",
        label: "Dégradation des panneaux",
        range: `${pct(S.DEGRADATION[0])} – ${pct(S.DEGRADATION[1])} / an`,
        ends: S.DEGRADATION.map(v => sc => { sc.assumptions.degradation = v; }),
      },
      {
        key: "discount",
        label: "Taux d'actualisation",
        range: `${pct(S.DISCOUNT_RATE[0])} – ${pct(S.DISCOUNT_RATE[1])}`,
        ends: S.DISCOUNT_RATE.map(v => sc => { sc.assumptions.discountRate = v; }),
      },
    ];
  },

  run(baseInputs) {
    const base = this.baseScenario(baseInputs);
    const baseResult = this.evaluate(base);
    const rows = this.variables().map(v => {
      const results = v.ends.map(apply => {
        const sc = this.clone(base);
        apply(sc);
        return this.evaluate(sc);
      });
      return {
        key: v.key,
        label: v.label,
        range: v.range,
        payback: results.map(r => r.payback),
        npv: results.map(r => r.npv),
      };
    });
    return { base: baseResult, rows };
  },
};

// ── Tornado chart (plain DOM) ──────────────────────
// Deliberately not Chart.js: floating stacked bars with per-row baselines are
// fiddly there, and a DOM chart keeps every number in the accessibility tree
// and readable at 375 px.
const Tornado = {
  metric: "payback",

  METRICS: {
    payback: {
      // Simple payback (capex / net year-1) — same definition as the hero KPI,
      // so the reference bar matches the headline number.
      title: "Amortissement",
      betterIsLower: true,
      // Non-amortised cases are clamped so one runaway scenario cannot squash
      // the whole scale; the label still says "> 25 ans".
      scale: v => (isFinite(v) ? Math.min(v, CONFIG.LIFETIME_YR + 5) : CONFIG.LIFETIME_YR + 5),
      fmt: v => (isFinite(v) && v <= CONFIG.LIFETIME_YR
        ? v.toFixed(1).replace(".", ",") + " ans"
        : "> 25 ans"),
      // Below this, a lever is not worth a bar (years).
      epsilon: 0.05,
      // Past the modelled lifetime every scenario piles up on the clamp, so
      // the bars would compare nothing. Say that instead of drawing it.
      unreadable: v => !isFinite(v) || v > CONFIG.LIFETIME_YR,
    },
    npv: {
      title: "Gain net actualisé sur 25 ans",
      betterIsLower: false,
      scale: v => v,
      fmt: v => fmtMAD(v),
      epsilon: 100,
    },
  },

  render(result) {
    const host = $("tornado");
    const m = this.METRICS[this.metric];
    if (!host || !result) return;

    const baseVal = result.base[this.metric];
    $("sens-base").textContent =
      `Scénario de référence : ${m.fmt(baseVal)} — ${m.title.toLowerCase()}`;

    if (m.unreadable && m.unreadable(baseVal)) {
      host.innerHTML = `<div class="tor-empty">Avec ces paramètres l'installation ne s'amortit pas sur sa durée de vie : comparer des délais d'amortissement n'a plus de sens. Basculez sur « Gain net 25 ans » pour voir quelles hypothèses pèsent le plus.</div>`;
      return;
    }

    const rows = result.rows
      .map(r => {
        const [a, b] = r[this.metric].map(m.scale);
        return { label: r.label, range: r.range, lo: Math.min(a, b), hi: Math.max(a, b), span: Math.abs(a - b) };
      })
      .filter(r => r.span > m.epsilon)
      .sort((x, y) => y.span - x.span);

    if (!rows.length) {
      host.innerHTML = `<div class="tor-empty">Aucune hypothèse ne déplace cet indicateur de façon significative.</div>`;
      return;
    }

    const baseScaled = m.scale(baseVal);
    const values = rows.flatMap(r => [r.lo, r.hi]).concat(baseScaled);
    let dmin = Math.min(...values), dmax = Math.max(...values);
    const pad = (dmax - dmin) * 0.06 || Math.abs(dmax || 1) * 0.06;
    dmin -= pad; dmax += pad;
    const pos = v => ((v - dmin) / (dmax - dmin)) * 100;

    // Left of the reference line = lower value. Whether that is good depends
    // on the metric, not on the geometry.
    const leftClass = m.betterIsLower ? "tor-good" : "tor-bad";
    const rightClass = m.betterIsLower ? "tor-bad" : "tor-good";
    const basePct = pos(baseScaled);

    host.innerHTML = rows.map(r => {
      const loPct = pos(Math.min(r.lo, baseScaled));
      const hiPct = pos(Math.max(r.hi, baseScaled));
      return `
      <div class="tor-row">
        <div class="tor-label">
          <span class="tor-name">${escapeHtml(r.label)}</span>
          <span class="tor-range">${escapeHtml(r.range)}</span>
        </div>
        <div class="tor-val tor-val-lo">${escapeHtml(m.fmt(r.lo))}</div>
        <div class="tor-track">
          <div class="tor-bar ${leftClass}" style="left:${loPct}%;width:${Math.max(0, basePct - loPct)}%"></div>
          <div class="tor-bar ${rightClass}" style="left:${basePct}%;width:${Math.max(0, hiPct - basePct)}%"></div>
          <div class="tor-axis" style="left:${basePct}%"></div>
        </div>
        <div class="tor-val tor-val-hi">${escapeHtml(m.fmt(r.hi))}</div>
      </div>`;
    }).join("");
  },
};

// ── Chart wrappers ─────────────────────────────────
const Chart_ = {
  monthly: null,
  cashflow: null,

  renderMonthly(monthlyKwh) {
    const ctx = document.getElementById("monthly-chart").getContext("2d");
    if (this.monthly) this.monthly.destroy();
    this.monthly = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sept","Oct","Nov","Déc"],
        datasets: [{
          data: monthlyKwh,
          backgroundColor: "#FF6B35",
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          label: (c) => `${Math.round(c.parsed.y)} kWh`,
        }}},
        scales: {
          x: { grid: { display: false }, ticks: { color: "#5A6577" } },
          y: { grid: { color: "#F0F2F5" }, ticks: { color: "#5A6577", callback: v => v + " kWh" } },
        },
      },
    });
  },

  renderCashflow(cashflow, paybackYr) {
    const ctx = document.getElementById("cashflow-chart").getContext("2d");
    if (this.cashflow) this.cashflow.destroy();
    this.cashflow = new Chart(ctx, {
      type: "line",
      data: {
        labels: cashflow.map(c => "An " + c.year),
        datasets: [{
          data: cashflow.map(c => Math.round(c.cumulative)),
          borderColor: "#001F4D",
          backgroundColor: "rgba(0,31,77,0.08)",
          fill: true,
          tension: 0.15,
          pointRadius: 0,
          pointHoverRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            label: (c) => `${c.parsed.y.toLocaleString("fr-FR")} MAD`,
          }},
          annotation: {},
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#5A6577", maxTicksLimit: 8 } },
          y: {
            grid: { color: "#F0F2F5" },
            ticks: { color: "#5A6577", callback: v => (v/1000).toFixed(0) + "k" },
          },
        },
      },
    });
  },
};

// ── Map (Leaflet) ──────────────────────────────────
const MapView = {
  map: null,
  marker: null,
  set(lat, lon, label) {
    if (!this.map) {
      this.map = L.map("map", { zoomControl: true, attributionControl: true })
        .setView([lat, lon], 18);
      // Default: satellite (Esri World Imagery — token-free, roof-level detail
      // so the user recognises their own house). OSM plan as the alternative.
      const satellite = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
        }
      ).addTo(this.map);
      const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      });
      L.control.layers(
        { "Satellite": satellite, "Plan (OSM)": osm },
        null,
        { position: "topright" }
      ).addTo(this.map);
    } else {
      this.map.setView([lat, lon], 18);
    }
    if (this.marker) this.marker.remove();
    this.marker = L.marker([lat, lon]).addTo(this.map);
    if (label) this.marker.bindPopup(label);
    // Fix stale size when shown after being hidden
    setTimeout(() => this.map.invalidateSize(), 100);
  },
};

// ── UI ─────────────────────────────────────────────
const State = {
  location: null,   // { lat, lon, label }
  params: {
    bill: 400,      // MAD/month — the primary user input
    peakpower: 3,
    angle: 30,
    aspect: 0,
    cost: 11,
    exportAllowed: false,
  },
  sizeAuto: true,   // auto-recommend peakpower from the bill until user overrides
  lastPvKey: null,
  lastPerKw: null,  // cached 1 kWc PVGIS response for current (loc, angle, aspect)
  lastSensitivity: null,  // last Sensitivity.run() result, for metric switching
  heroAnimated: false,
};

const $ = (id) => document.getElementById(id);

const UI = {
  init() {
    // Step 1
    $("address-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleAddressSubmit();
    });
    $("address-input").addEventListener("input", debounce(() => this.showSuggestions(), 300));

    document.querySelectorAll(".chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const lat = parseFloat(chip.dataset.lat);
        const lon = parseFloat(chip.dataset.lon);
        this.setLocationAndGo({ lat, lon, label: chip.dataset.label });
      });
    });

    // Step 2 params
    ["peakpower", "angle", "aspect", "cost"].forEach(id => {
      const input = $(id);
      input.addEventListener("input", () => {
        State.params[id] = parseFloat(input.value);
        if (id === "peakpower") {
          State.sizeAuto = false;
          $("size-auto-badge").hidden = true;
          $("size-auto-reset").hidden = false;
        }
        this.renderParamLabels();
        this.recalc();
      });
    });
    $("size-auto-reset").addEventListener("click", () => {
      State.sizeAuto = true;
      $("size-auto-badge").hidden = false;
      $("size-auto-reset").hidden = true;
      this.recalc();
    });
    $("export-toggle").addEventListener("change", (e) => {
      State.params.exportAllowed = e.target.checked;
      this.recalc();
    });

    // Bill — slider + presets
    $("bill").addEventListener("input", () => {
      State.params.bill = parseFloat($("bill").value);
      this.syncBillPresets();
      this.renderParamLabels();
      this.recalc();
    });
    document.querySelectorAll(".bill-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        State.params.bill = parseFloat(chip.dataset.bill);
        $("bill").value = State.params.bill;
        this.syncBillPresets();
        this.renderParamLabels();
        this.recalc();
      });
    });

    // Sensitivity metric switch
    document.querySelectorAll(".sens-metric").forEach(btn => {
      btn.addEventListener("click", () => {
        Tornado.metric = btn.dataset.metric;
        document.querySelectorAll(".sens-metric").forEach(b => {
          const on = b === btn;
          b.classList.toggle("active", on);
          b.setAttribute("aria-pressed", String(on));
        });
        Tornado.render(State.lastSensitivity);
      });
    });

    $("back-btn").addEventListener("click", () => this.goToStep(1));

    this.renderParamLabels();
  },

  showStep1Error(msg) {
    const el = $("step1-error");
    el.textContent = msg;
    el.hidden = false;
  },
  clearStep1Error() { $("step1-error").hidden = true; },

  async showSuggestions() {
    const q = $("address-input").value.trim();
    const list = $("address-suggestions");
    if (q.length < 3) { list.hidden = true; return; }
    try {
      const results = await Geocoder.search(q);
      if (!results.length) { list.hidden = true; return; }
      list.innerHTML = results.map((r, i) =>
        `<li data-idx="${i}"><strong>${escapeHtml(r.short)}</strong><br><span style="color:#5A6577;font-size:12px">${escapeHtml(r.label)}</span></li>`
      ).join("");
      list.hidden = false;
      list.querySelectorAll("li").forEach((li, i) => {
        li.addEventListener("click", () => {
          const r = results[i];
          $("address-input").value = r.short;
          list.hidden = true;
          this.setLocationAndGo(r);
        });
      });
    } catch (e) { list.hidden = true; }
  },

  async handleAddressSubmit() {
    this.clearStep1Error();
    const q = $("address-input").value.trim();
    if (!q) return;
    $("estimate-btn").disabled = true;
    $("estimate-btn").textContent = "Recherche…";
    try {
      const results = await Geocoder.search(q);
      if (!results.length) {
        this.showStep1Error("Adresse introuvable. Précisez la ville.");
        return;
      }
      await this.setLocationAndGo(results[0]);
    } catch (e) {
      this.showStep1Error("Erreur de géocodage. Réessayez.");
    } finally {
      $("estimate-btn").disabled = false;
      $("estimate-btn").textContent = "Estimer";
    }
  },

  async setLocationAndGo(loc) {
    State.location = loc;
    State.heroAnimated = false;   // replay the count-up for a new address
    this.goToStep(2);
    $("location-label").textContent = loc.label || `${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)}`;
    $("coords-label").textContent = `${loc.lat.toFixed(4)}°N, ${Math.abs(loc.lon).toFixed(4)}°${loc.lon < 0 ? "W" : "E"}`;
    MapView.set(loc.lat, loc.lon, loc.label);
    await this.recalc({ force: true });
  },

  setHeroLoading(on) {
    $("hero-loading").hidden = !on;
    $("hero-content").hidden = on;
    if (on) {
      const msgs = [
        "Analyse du gisement solaire…",
        "Interrogation de PVGIS (Commission européenne)…",
        "Calcul de votre rentabilité…",
      ];
      let i = 0;
      $("hero-loading-msg").textContent = msgs[0];
      clearInterval(this._loadingTicker);
      this._loadingTicker = setInterval(() => {
        i = (i + 1) % msgs.length;
        const el = $("hero-loading-msg");
        if (el) el.textContent = msgs[i];
      }, 1100);
    } else {
      clearInterval(this._loadingTicker);
    }
  },

  goToStep(n) {
    $("step1").classList.toggle("active", n === 1);
    $("step2").classList.toggle("active", n === 2);
    if (n === 1) window.scrollTo({ top: 0, behavior: "smooth" });
  },

  syncBillPresets() {
    document.querySelectorAll(".bill-chip").forEach(c =>
      c.classList.toggle("active", parseFloat(c.dataset.bill) === State.params.bill));
  },

  renderParamLabels() {
    const p = State.params;
    const consumption = Tariff.kwhFromBill(p.bill);
    $("bill-val").textContent = fmtNum(p.bill) + " MAD";
    $("bill-consumption-hint").textContent =
      `soit environ ${Math.round(consumption)} kWh par mois`;
    $("peakpower-val").textContent = p.peakpower.toFixed(1) + " kWc";
    $("peakpower-hint").textContent = `≈ ${Math.round(p.peakpower * CONFIG.M2_PER_KWP)} m² de panneaux`;
    $("angle-val").textContent = p.angle + "°";
    $("aspect-val").textContent = aspectLabel(p.aspect);
    $("cost-val").textContent = p.cost.toFixed(1) + " MAD/Wc";
    const capex = p.peakpower * 1000 * p.cost;
    $("capex-hint").textContent = `Investissement total : ${fmtMAD(capex)}`;
  },

  async recalc({ force = false } = {}) {
    if (!State.location) return;
    const p = State.params;
    // PVGIS is fetched at 1 kWc per (lat, lon, angle, aspect); size and bill
    // changes scale locally with zero network.
    const key = [
      State.location.lat.toFixed(4),
      State.location.lon.toFixed(4),
      p.angle, p.aspect,
    ].join("|");

    if (force || key !== State.lastPvKey) {
      this.setHeroLoading(true);
      try {
        State.lastPerKw = await PVGIS.fetchPerKw({
          lat: State.location.lat,
          lon: State.location.lon,
          angle: p.angle,
          aspect: p.aspect,
        });
        State.lastPvKey = key;
        $("step2-error").hidden = true;
      } catch (e) {
        console.error(e);
        // Degrade to the nearest-city estimate rather than a dead end.
        State.lastPerKw = PVGIS.fallbackPerKw(State.location.lat, State.location.lon);
        State.lastPvKey = key;
      }
      this.setHeroLoading(false);
    }
    if (!State.lastPerKw) return;

    // Approximate-mode notice (fallback data in use)
    const srcEl = document.querySelector(".hero-source");
    if (State.lastPerKw.approximate && srcEl) {
      srcEl.innerHTML = `⚠ Service de calcul momentanément indisponible — estimation approximative basée sur la ville de ${escapeHtml(State.lastPerKw.referenceCity)}.`;
    }

    // Derive consumption from the bill; auto-size the system if not overridden
    const consumption = Tariff.kwhFromBill(p.bill);
    if (State.sizeAuto) {
      const targetKw = (consumption * 12 * CONFIG.AUTOSIZE_COVER) / State.lastPerKw.yieldPerKw;
      p.peakpower = Math.min(10, Math.max(1, Math.round(targetKw * 2) / 2));
      $("peakpower").value = p.peakpower;
      this.renderParamLabels();
    }

    const pv = PVGIS.scale(State.lastPerKw, p.peakpower);
    const capexMAD = p.peakpower * 1000 * p.cost;
    const roi = ROI.compute({
      pv,
      monthlyConsumption: consumption,
      capexMAD,
      exportAllowed: p.exportAllowed,
    });

    // Hero
    const savings = Math.round(roi.annualSavingsMAD);
    countUp($("hero-savings"), savings, State.heroAnimated ? 0 : 900);
    State.heroAnimated = true;
    $("chip-size").textContent = p.peakpower.toFixed(1).replace(".0", "") + " kWc";
    $("chip-production").textContent = fmtNum(pv.annualKwh) + " kWh";
    $("chip-payback").textContent = isFinite(roi.paybackYr) ? roi.paybackYr.toFixed(1) + " ans" : "—";
    const co2Tons = (pv.annualKwh * CONFIG.CO2_KG_PER_KWH) / 1000;
    $("chip-co2").textContent = co2Tons.toFixed(1) + " t";

    // Financing card
    const loanMonthly = Finance.monthlyPayment(capexMAD, CONFIG.LOAN_APR, CONFIG.LOAN_YEARS);
    const pvMonthlySavings = roi.annualSavingsMAD / 12;
    const cashflowY1 = roi.annualSavingsMAD - capexMAD * CONFIG.OPEX_PCT_CAPEX_YR;
    $("fin-cash-capex").innerHTML = `${fmtNum(capexMAD)} <span class="unit">MAD</span>`;
    $("fin-cash-net").textContent = `Économie an 1 : ${fmtMAD(cashflowY1)}`;
    $("fin-cash-payback").textContent = isFinite(roi.paybackYr)
      ? `Amorti en ${roi.paybackYr.toFixed(1)} ans`
      : `Non amorti sur 25 ans`;

    $("fin-loan-monthly").innerHTML = `${fmtNum(loanMonthly)} <span class="unit">MAD/mois</span>`;
    $("fin-loan-savings").textContent = `Économies PV : ${fmtNum(pvMonthlySavings)} MAD/mois`;
    const balance = pvMonthlySavings - loanMonthly;
    if (balance >= 0) {
      $("fin-loan-note").textContent = `Cash-flow positif dès le 1er mois : +${fmtNum(balance)} MAD/mois`;
    } else {
      const after = CONFIG.LOAN_YEARS;
      $("fin-loan-note").textContent = `Effort net ${fmtNum(-balance)} MAD/mois pendant ${after} ans, puis +${fmtNum(pvMonthlySavings)} MAD/mois`;
    }
    $("fin-rate-note").textContent =
      `${(CONFIG.LOAN_APR * 100).toFixed(0)} % sur ${CONFIG.LOAN_YEARS} ans`;

    Chart_.renderMonthly(pv.monthlyKwh);
    Chart_.renderCashflow(roi.cashflow, roi.paybackYr);

    // Sensitivity — 8 levers × 2 ends, all local arithmetic on the cached
    // 1 kWc PVGIS response, so no extra network call.
    State.lastSensitivity = Sensitivity.run({
      perKw: State.lastPerKw,
      peakpower: p.peakpower,
      costPerWc: p.cost,
      bill: p.bill,
      exportAllowed: p.exportAllowed,
    });
    Tornado.render(State.lastSensitivity);
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

// ── Help tooltips ──────────────────────────────────
// Hover handles desktop. Touch needs an explicit toggle: :focus behaviour on
// buttons is inconsistent across mobile browsers, so tapping must not depend
// on it. Tap opens, tapping again / elsewhere / Escape closes.
const Tooltips = {
  init() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".help");
      document.querySelectorAll(".help.open").forEach(h => {
        if (h !== btn) h.classList.remove("open");
      });
      if (btn) {
        e.preventDefault();
        btn.classList.toggle("open");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".help.open").forEach(h => h.classList.remove("open"));
      }
    });
  },
};

// ── Helpers ────────────────────────────────────────
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function countUp(el, target, ms) {
  // Cancel any in-flight animation so a newer value can never be overwritten
  // by a stale animation frame.
  if (el._raf) cancelAnimationFrame(el._raf);
  if (el._timer) clearTimeout(el._timer);
  el._raf = null;

  // rAF does not fire in background tabs, and animation is unwanted when the
  // user asks for reduced motion — in both cases land the value directly.
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!ms || reduceMotion || document.hidden) {
    el.textContent = fmtNum(target);
    return;
  }

  const t0 = performance.now();
  const ease = x => 1 - Math.pow(1 - x, 3);   // ease-out cubic
  const tick = (now) => {
    const x = Math.min(1, (now - t0) / ms);
    el.textContent = fmtNum(target * ease(x));
    el._raf = x < 1 ? requestAnimationFrame(tick) : null;
  };
  el._raf = requestAnimationFrame(tick);

  // Safety net: if rAF is throttled or suspended mid-flight, the headline
  // number must still end on the real value rather than a partial one.
  el._timer = setTimeout(() => {
    if (el._raf) { cancelAnimationFrame(el._raf); el._raf = null; }
    el.textContent = fmtNum(target);
  }, ms + 150);
}
function fmtNum(n) {
  return Math.round(n).toLocaleString("fr-FR");
}
function fmtMAD(n) {
  return fmtNum(n) + " MAD";
}
function aspectLabel(a) {
  if (a === 0) return "Sud";
  if (a === -90) return "Est";
  if (a === 90) return "Ouest";
  const dir = a < 0 ? "Est" : "Ouest";
  return `${Math.abs(a)}° ${dir} du Sud`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Boot when DOM + libs ready
window.addEventListener("load", () => { UI.init(); Tooltips.init(); });
