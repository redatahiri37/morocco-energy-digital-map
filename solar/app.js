/* Wattu — Morocco residential PV estimator
 * ------------------------------------------------
 * Modules:
 *   CONFIG        constants that are easy to update (tariffs, cost, CO2, etc.)
 *   Geocoder      Nominatim (OSM) address → {lat, lon, label}
 *   PVGIS         EU JRC PVcalc via our Worker → annual + monthly kWh
 *   Tariff        ONEE stepped tariff, avoided cost per kWh
 *   ROI           payback, cashflow, NPV
 *   Chart_        Chart.js wrappers
 *   Roof          footprint geometry, panel layout, OSM building lookup
 *   MapView       Leaflet map, roof overlay, roof drawing
 *   UI            DOM binding, state, transitions
 *   Finance, Tooltips, Depth, helpers
 * Analytics lives in analytics.js.
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
    const url = `${CONFIG.PVGIS_WORKER_URL}?${params}`;
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

// ── Chart wrappers ─────────────────────────────────
const CHART_INK = "#5A6577", CHART_GRID = "#EEF1F5";
const Chart_ = {
  // Brand type on every chart; called once Chart.js is there.
  init() {
    if (typeof Chart === "undefined" || !Chart.defaults) return;
    Chart.defaults.font.family = getComputedStyle(document.documentElement).getPropertyValue("--w-font-ui").trim() || "system-ui";
    Chart.defaults.color = CHART_INK;
  },
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
          backgroundColor: (c) => {
            // Sunrise gradient down each bar
            const { chartArea, ctx: g } = c.chart;
            if (!chartArea) return "#FF6B35";
            const grad = g.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            grad.addColorStop(0, "#FFB347");
            grad.addColorStop(1, "#FF6B35");
            return grad;
          },
          borderRadius: 6,
          maxBarThickness: 34,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          label: (c) => `${Math.round(c.parsed.y)} kWh`,
        }}},
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: CHART_INK } },
          y: { grid: { color: CHART_GRID }, border: { display: false }, ticks: { color: CHART_INK, callback: v => v + " kWh" } },
        },
      },
    });
  },

  renderCashflow(cashflow) {
    const ctx = document.getElementById("cashflow-chart").getContext("2d");
    if (this.cashflow) this.cashflow.destroy();
    this.cashflow = new Chart(ctx, {
      type: "line",
      data: {
        labels: cashflow.map(c => "An " + c.year),
        datasets: [{
          data: cashflow.map(c => Math.round(c.cumulative)),
          borderColor: "#001F4D",
          borderWidth: 2.5,
          backgroundColor: (c) => {
            const { chartArea, ctx: g } = c.chart;
            if (!chartArea) return "rgba(0,31,77,0.08)";
            const grad = g.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            grad.addColorStop(0, "rgba(255,107,53,0.22)");
            grad.addColorStop(1, "rgba(0,31,77,0.02)");
            return grad;
          },
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
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: CHART_INK, maxTicksLimit: 8 } },
          y: {
            grid: { color: CHART_GRID },
            border: { display: false },
            ticks: { color: CHART_INK, callback: v => (v/1000).toFixed(0) + "k" },
          },
        },
      },
    });
  },
};

// ── Roof geometry ──────────────────────────────────
// Pure functions on a building footprint. Coordinates are projected to a
// local plane in metres (x east, y north) around the footprint, which is
// accurate to well under 1% at house scale.
const Roof = {
  origin(latlngs) {
    const lat = latlngs.reduce((s, p) => s + p[0], 0) / latlngs.length;
    const lon = latlngs.reduce((s, p) => s + p[1], 0) / latlngs.length;
    return { lat, lon, mx: 111320 * Math.cos(lat * Math.PI / 180), my: 110540 };
  },
  toLocal(latlngs, o) {
    return latlngs.map(([lat, lon]) => [(lon - o.lon) * o.mx, (lat - o.lat) * o.my]);
  },
  toLatLng(pts, o) {
    return pts.map(([x, y]) => [o.lat + y / o.my, o.lon + x / o.mx]);
  },
  // Shoelace formula, m²
  area(pts) {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    }
    return Math.abs(a) / 2;
  },
  contains(pts, [x, y]) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  },
  distToEdges(pts, [x, y]) {
    let best = Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, ay] = pts[j], [bx, by] = pts[i];
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
    }
    return best;
  },
  // Every panel position that fits on the roof, rows facing `aspect`
  // (PVGIS convention: 0 = south, -90 = east, 90 = west) at `tilt` degrees.
  // Returns local-metre rectangles, ordered row by row from the sunny edge.
  layout(pts, { aspect = 0, tilt = 0 } = {}) {
    const a = aspect * Math.PI / 180, t = tilt * Math.PI / 180;
    const f = [-Math.sin(a), -Math.cos(a)];   // facing direction (south = [0,-1])
    const u = [Math.cos(a), -Math.sin(a)];    // along the row
    const toUV = ([x, y]) => [x * u[0] + y * u[1], x * f[0] + y * f[1]];
    const fromUV = (uu, vv) => [uu * u[0] + vv * f[0], uu * u[1] + vv * f[1]];
    const W = CONFIG.PANEL_W_M;
    const depth = CONFIG.PANEL_L_M * Math.cos(t);
    const shadow = CONFIG.PANEL_L_M * Math.sin(t) / Math.tan(CONFIG.ROW_SHADOW_SUN_ELEV_DEG * Math.PI / 180);
    const pitch = depth + shadow;
    const sb = CONFIG.ROOF_SETBACK_M;
    const uv = pts.map(toUV);
    const minU = Math.min(...uv.map(p => p[0])), maxU = Math.max(...uv.map(p => p[0]));
    const minV = Math.min(...uv.map(p => p[1])), maxV = Math.max(...uv.map(p => p[1]));
    const ok = (p) => this.contains(pts, p) && this.distToEdges(pts, p) >= sb - 1e-6;
    const panels = [];
    // Start from the sunny edge (largest v = furthest toward the facing direction)
    rows:
    for (let v = maxV - sb; v - depth >= minV + sb - 1e-6; v -= pitch) {
      for (let uu = minU + sb; uu + W <= maxU - sb + 1e-6; uu += W + 0.02) {
        const rect = [fromUV(uu, v), fromUV(uu + W, v), fromUV(uu + W, v - depth), fromUV(uu, v - depth)];
        if (rect.every(ok)) panels.push(rect);
        if (panels.length >= CONFIG.MAX_PANEL_SLOTS) break rows;
      }
    }
    return panels;
  },
  // OSM building around a point: the one containing it, else the nearest
  // within the search radius. Resolves to [[lat, lon], …] or null.
  async findBuilding(lat, lon) {
    const r = CONFIG.BUILDING_SEARCH_RADIUS_M;
    const q = `[out:json][timeout:10];way["building"](around:${r},${lat},${lon});out geom;`;
    const res = await fetch(CONFIG.OVERPASS_URL, {
      method: "POST",
      body: "data=" + encodeURIComponent(q),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!res.ok) throw new Error("Overpass " + res.status);
    const ways = ((await res.json()).elements || [])
      .filter(e => e.type === "way" && e.geometry && e.geometry.length >= 4)
      .map(e => e.geometry.slice(0, -1).map(g => [g.lat, g.lon]));   // drop the closing vertex
    if (!ways.length) return null;
    const o = { lat, lon, mx: 111320 * Math.cos(lat * Math.PI / 180), my: 110540 };
    const scored = ways.map(w => {
      const pts = this.toLocal(w, o);
      return { w, inside: this.contains(pts, [0, 0]), d: this.distToEdges(pts, [0, 0]) };
    });
    const hit = scored.find(s => s.inside) || scored.sort((a, b) => a.d - b.d)[0];
    return hit.w;
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
          maxZoom: 21, maxNativeZoom: 19,   // upscale so a house fills the map
          attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
        }
      ).addTo(this.map);
      const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 21, maxNativeZoom: 19,
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
    if (label) {
      const text = document.createElement("span");
      text.textContent = label;   // OSM data: text, never HTML
      this.marker.bindPopup(text);
    }
    this.clearRoof();
    // Fix stale size when shown after being hidden
    setTimeout(() => this.map.invalidateSize(), 100);
  },

  // Roof outline + panels. Layers are kept so each recalc replaces them.
  roofLayer: null,
  panelLayer: null,
  clearRoof() {
    if (this.marker) this.marker.setOpacity(1);
    if (this.roofLayer) this.roofLayer.remove();
    if (this.panelLayer) this.panelLayer.remove();
    this.roofLayer = this.panelLayer = null;
  },
  // panelsLatLng: the proposed installation; slotsLatLng: every other place
  // a panel fits, drawn faintly so the roof's full potential is visible.
  showRoof(latlngs, panelsLatLng, slotsLatLng = [], { fit = false } = {}) {
    if (!this.map) return;
    this.clearRoof();
    this.roofLayer = L.polygon(latlngs, {
      color: "#FF6B35", weight: 2.5, fillColor: "#FF6B35", fillOpacity: 0.12, interactive: false,
    }).addTo(this.map);
    // The outline marks the address; the pin would only hide the panels.
    if (this.marker) this.marker.setOpacity(0);
    const rect = (r, style) => L.polygon(r, { interactive: false, ...style });
    this.panelLayer = L.layerGroup([
      ...slotsLatLng.map(r => rect(r, { color: "#ffffff", weight: 0.8, opacity: 0.85, fillColor: "#4ade80", fillOpacity: 0.35 })),
      ...panelsLatLng.map(r => rect(r, { color: "#bfdbfe", weight: 1, fillColor: "#1e3a8a", fillOpacity: 0.95 })),
    ]).addTo(this.map);
    // Zoom 20 rather than 21: Esri imagery stops at 19, so 21 is very blurry.
    if (fit) this.map.fitBounds(this.roofLayer.getBounds(), { padding: [24, 24], maxZoom: 20 });
  },

  // "Dessiner mon toit": clicks add corners; finish() closes the polygon.
  draw: null,
  startDraw(onDone) {
    if (!this.map) return;
    this.cancelDraw();
    this.clearRoof();
    const pts = [];
    const line = L.polyline([], { color: "#FF6B35", weight: 2, dashArray: "4 4", interactive: false }).addTo(this.map);
    const dots = L.layerGroup().addTo(this.map);
    const onClick = (e) => {
      pts.push([e.latlng.lat, e.latlng.lng]);
      line.setLatLngs(pts);
      L.circleMarker(e.latlng, { radius: 4, color: "#FF6B35", fillOpacity: 1, interactive: false }).addTo(dots);
      if (this.draw.onChange) this.draw.onChange(pts.length);
    };
    this.map.on("click", onClick);
    this.map.getContainer().classList.add("drawing");
    this.map.doubleClickZoom.disable();
    this.draw = { pts, line, dots, onClick, onDone, onChange: null };
    return this.draw;
  },
  finishDraw() {
    if (!this.draw) return;
    const { pts, onDone } = this.draw;
    this.cancelDraw();
    if (pts.length >= 3) onDone(pts);
  },
  cancelDraw() {
    if (!this.draw) return;
    const { line, dots, onClick } = this.draw;
    this.map.off("click", onClick);
    line.remove();
    dots.remove();
    this.map.getContainer().classList.remove("drawing");
    this.map.doubleClickZoom.enable();
    this.draw = null;
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
  candidates: [],   // every geocoder match for the last typed address
  roof: null,       // { latlngs, src: "osm" | "drawn" } — building footprint, if known
  roofSearch: 0,    // id of the latest building lookup, so a stale one is ignored
  pvSeq: 0,         // id of the latest PVGIS request, so a late older one is dropped
  lastPvKey: null,
  lastPerKw: null,  // cached 1 kWc PVGIS response for current (loc, angle, aspect)
  heroAnimated: false,
  savings: 0,       // last annual savings shown, for the share text
};

const $ = (id) => document.getElementById(id);

const UI = {
  init() {
    // Step 1
    $("address-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleAddressSubmit();
    });
    $("address-input").addEventListener("input", () => Analytics.once("address_input", "address_input"));

    document.querySelectorAll(".chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const lat = parseFloat(chip.dataset.lat);
        const lon = parseFloat(chip.dataset.lon);
        State.candidates = [];
        this.setLocationAndGo({ lat, lon, label: chip.dataset.label, src: "chip" });
      });
    });

    // Step 2 params
    const recalcSoon = debounce(() => this.recalc(), 300);
    ["peakpower", "angle", "aspect", "cost"].forEach(id => {
      const input = $(id);
      input.addEventListener("input", () => {
        // once() per field: a slider fires continuously, and what we want to
        // know is whether anyone touches it at all, not how many pixels.
        Analytics.once("param_change:" + id, "param_change", { field: id });
        State.params[id] = parseFloat(input.value);
        if (id === "peakpower") {
          State.sizeAuto = false;
          $("size-auto-badge").hidden = true;
          $("size-auto-reset").hidden = false;
        }
        this.renderParamLabels();
        if (id === "angle" || id === "aspect") recalcSoon();
        else this.recalc();
      });
    });
    // Roof: draw / finish / clear
    $("roof-draw-btn").addEventListener("click", () => {
      Analytics.once("roof_draw", "roof", { src: "draw_start" });
      const d = MapView.startDraw((pts) => {
        State.roof = { latlngs: pts, src: "drawn" };
        Analytics.track("roof", { src: "drawn" });
        this.setRoofDrawing(false);
        this.recalc({ fitRoof: true });
      });
      if (!d) return;
      d.onChange = (n) => { $("roof-done-btn").disabled = n < 3; };
      this.setRoofDrawing(true);
    });
    $("roof-done-btn").addEventListener("click", () => MapView.finishDraw());
    $("roof-cancel-btn").addEventListener("click", () => {
      MapView.cancelDraw();
      this.setRoofDrawing(false);
      this.recalc();
    });

    $("size-auto-reset").addEventListener("click", () => {
      Analytics.once("param_change:size_reset", "param_change", { field: "size_reset" });
      State.sizeAuto = true;
      $("size-auto-badge").hidden = false;
      $("size-auto-reset").hidden = true;
      this.recalc();
    });
    $("export-toggle").addEventListener("change", (e) => {
      Analytics.once("param_change:export", "param_change", { field: "export" });
      State.params.exportAllowed = e.target.checked;
      this.recalc();
    });

    // Bill — slider + presets
    $("bill").addEventListener("input", () => {
      Analytics.once("param_change:bill", "param_change", { field: "bill" });
      State.params.bill = parseFloat($("bill").value);
      this.syncBillPresets();
      this.renderParamLabels();
      recalcSoon();
    });
    document.querySelectorAll(".bill-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        Analytics.once("param_change:bill_chip", "param_change", { field: "bill_chip" });
        State.params.bill = parseFloat(chip.dataset.bill);
        $("bill").value = State.params.bill;
        this.syncBillPresets();
        this.renderParamLabels();
        this.recalc();
      });
    });

    $("back-btn").addEventListener("click", () => {
      this.goToStep(1);
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
    });
    $("geo-btn").addEventListener("click", () => this.useMyPosition());
    $("share-btn").addEventListener("click", () => this.share());
    $("print-btn").addEventListener("click", () => window.print());
    this.syncUrlSoon = debounce(() => this.syncUrl(), 400);

    this.renderParamLabels();
    this.restoreFromUrl();
  },

  // "Utiliser ma position": on a phone, standing at home, this is the most
  // precise address there is — and the roof lookup then lands on the house.
  useMyPosition() {
    this.clearStep1Error();
    if (!("geolocation" in navigator)) {
      this.showStep1Error("La géolocalisation n'est pas disponible sur cet appareil. Entrez votre adresse.");
      return;
    }
    const btn = $("geo-btn"), label = $("geo-btn-label");
    btn.disabled = true;
    label.textContent = "Localisation…";
    const reset = () => { btn.disabled = false; label.textContent = "Utiliser ma position"; };
    navigator.geolocation.getCurrentPosition((pos) => {
      reset();
      const { latitude: lat, longitude: lon } = pos.coords;
      if (!inMorocco(lat, lon)) {
        this.showStep1Error("Votre position semble hors du Maroc. Entrez une adresse marocaine.");
        return;
      }
      State.candidates = [];
      this.setLocationAndGo({ lat, lon, label: "Ma position", src: "geoloc" });
    }, (err) => {
      reset();
      this.showStep1Error(err.code === 1
        ? "Localisation refusée. Autorisez-la dans votre navigateur, ou entrez votre adresse."
        : "Position introuvable pour le moment. Entrez votre adresse.");
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  },

  // The estimate lives in the URL hash, so it can be shared, bookmarked or
  // reopened as is. A hash never reaches a server, our analytics included.
  // The address label (n) is added only when the visitor shares: otherwise
  // the home address would sit in browser history for nothing.
  syncUrl({ withLabel = false } = {}) {
    if (!State.location || !$("step2").classList.contains("active")) return;
    const p = State.params, l = State.location;
    const q = new URLSearchParams({
      lat: l.lat.toFixed(5), lon: l.lon.toFixed(5),
      f: p.bill, a: p.angle, o: p.aspect, c: p.cost,
    });
    if (!State.sizeAuto) q.set("p", p.peakpower);
    if (p.exportAllowed) q.set("x", "1");
    if (withLabel && l.label) q.set("n", l.label.slice(0, 120));
    // Safari throws past ~100 calls in 30 s; a lost update is harmless.
    try { history.replaceState(null, "", "#" + q.toString()); } catch (e) { /* ignore */ }
  },

  restoreFromUrl() {
    const q = new URLSearchParams(location.hash.slice(1));
    const lat = parseFloat(q.get("lat")), lon = parseFloat(q.get("lon"));
    if (!inMorocco(lat, lon)) return;
    // Every value goes through its slider, so it is clamped and snapped
    // to the slider's own range and step.
    const take = (key, id, param) => {
      if (!q.has(key) || !Number.isFinite(parseFloat(q.get(key)))) return;
      $(id).value = q.get(key);
      State.params[param] = parseFloat($(id).value);
    };
    take("f", "bill", "bill");
    take("a", "angle", "angle");
    take("o", "aspect", "aspect");
    take("c", "cost", "cost");
    if (q.has("p")) {
      take("p", "peakpower", "peakpower");
      State.sizeAuto = false;
      $("size-auto-badge").hidden = true;
      $("size-auto-reset").hidden = false;
    }
    State.params.exportAllowed = q.get("x") === "1";
    $("export-toggle").checked = State.params.exportAllowed;
    this.syncBillPresets();
    this.renderParamLabels();
    State.candidates = [];
    // A link can carry any text: keep it short and plain so it cannot pass
    // for a message from us (phone numbers, offers…).
    const label = (q.get("n") || "").replace(/[^\p{L}\p{N} ,.'’()-]/gu, "").replace(/(\d[\s.-]*){8,}/g, "").slice(0, 120).trim();
    this.setLocationAndGo({ lat, lon, label, src: "link" });
  },

  async share() {
    this.syncUrl({ withLabel: true });
    const url = location.href;
    const text = `Toit solaire : environ ${fmtNum(State.savings)} MAD économisés par an, d'après Wattu.`;
    const btnLabel = $("share-btn-label");
    try {
      if (navigator.share) {
        await navigator.share({ title: "Mon estimation solaire — Wattu", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      $("share-btn").classList.add("done");
      btnLabel.textContent = "Lien copié";
      setTimeout(() => { $("share-btn").classList.remove("done"); btnLabel.textContent = "Partager"; }, 2000);
    } catch (e) {
      if (e && e.name === "AbortError") return;   // share sheet dismissed
      window.prompt("Copiez ce lien :", url);
    }
  },

  showStep1Error(msg) {
    const el = $("step1-error");
    el.textContent = msg;
    el.hidden = false;
  },
  clearStep1Error() { $("step1-error").hidden = true; },

  // Other matches for the typed address, shown in step 2 so a visitor sent
  // to the wrong "Rue de la Liberté" can switch in one tap.
  renderAlternatives(current) {
    const box = $("alt-addresses");
    const others = State.candidates
      .filter(c => c.lat !== current.lat || c.lon !== current.lon).slice(0, 4);
    box.hidden = !others.length;
    box.querySelectorAll("button").forEach(b => b.remove());
    others.forEach(c => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "alt-btn";
      b.textContent = c.short;
      b.title = c.label;
      b.addEventListener("click", () => this.setLocationAndGo({ ...c, src: "alternative" }));
      box.appendChild(b);
    });
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
        // The query itself is never sent — only the fact that it failed.
        Analytics.track("geocode_fail", { src: "no_result" });
        this.showStep1Error("Adresse introuvable. Précisez la ville.");
        return;
      }
      State.candidates = results;
      await this.setLocationAndGo(results[0]);
    } catch (e) {
      Analytics.track("geocode_fail", { src: "error" });
      this.showStep1Error("Erreur de géocodage. Réessayez.");
    } finally {
      $("estimate-btn").disabled = false;
      $("estimate-btn").textContent = "Estimer";
    }
  },

  async setLocationAndGo(loc) {
    // Activation — the single most important number in the funnel: how many
    // visitors get an actual estimate. Coordinates are coarsened to ~11 km
    // and the typed address is never transmitted.
    Analytics.setStep(2);
    Analytics.track("estimate", {
      src: loc.src || "typed",
      lat: Analytics.coarse(loc.lat),
      lon: Analytics.coarse(loc.lon),
    });
    State.location = loc;
    this.renderAlternatives(loc);
    State.heroAnimated = false;   // replay the count-up for a new address
    this.goToStep(2);
    $("location-label").textContent = loc.label || `${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)}`;
    $("coords-label").textContent = `${loc.lat.toFixed(4)}°N, ${Math.abs(loc.lon).toFixed(4)}°${loc.lon < 0 ? "W" : "E"}`;
    MapView.set(loc.lat, loc.lon, loc.label);
    State.roof = null;
    this.detectRoof(loc);   // runs alongside the PVGIS call; recalcs when it lands
    await this.recalc({ force: true });
  },

  // Look up the building under the address in OpenStreetMap. Never blocks
  // the estimate: if it fails or finds nothing, the user can draw the roof.
  async detectRoof(loc) {
    const id = ++State.roofSearch;
    this.setRoofInfo("Recherche du bâtiment sur OpenStreetMap…");
    let latlngs = null;
    try { latlngs = await Roof.findBuilding(loc.lat, loc.lon); }
    catch (e) { console.warn("[roof] building lookup failed", e); }
    if (id !== State.roofSearch || State.location !== loc) return;   // superseded
    if (State.roof && State.roof.src === "drawn") return;              // user drew meanwhile
    Analytics.track("roof", { src: latlngs ? "osm" : "none" });
    if (latlngs) {
      State.roof = { latlngs, src: "osm" };
      this.recalc({ fitRoof: true });
    } else {
      this.setRoofInfo("Aucun bâtiment trouvé à cette adresse sur OpenStreetMap. " +
        "Cliquez sur « Dessiner mon toit » et placez les coins de votre toit sur la carte.");
    }
  },

  setRoofInfo(html) { $("roof-info").innerHTML = html; },

  setRoofDrawing(on) {
    $("roof-draw-btn").hidden = on;
    $("roof-done-btn").hidden = !on;
    $("roof-cancel-btn").hidden = !on;
    $("roof-done-btn").disabled = true;
    if (on) this.setRoofInfo("Cliquez sur chaque coin de votre toit, puis « Terminer ».");
  },

  // Footprint area and the panels that fit for the current tilt/orientation.
  roofLayout() {
    if (!State.roof) return null;
    const { latlngs } = State.roof;
    const o = Roof.origin(latlngs);
    const pts = Roof.toLocal(latlngs, o);
    const panels = Roof.layout(pts, { aspect: State.params.aspect, tilt: State.params.angle });
    return {
      o, panels,
      areaM2: Roof.area(pts),
      capacityKw: panels.length * CONFIG.PANEL_KWP,
      capped: panels.length >= CONFIG.MAX_PANEL_SLOTS,
    };
  },

  // Roof card: map overlay, potential score, stat tiles. `m` carries the
  // numbers the score needs (target size, yield, payback).
  renderRoof(info, m, { fit = false } = {}) {
    const on = !!info;
    ["roof-legend", "roof-summary", "roof-stats"].forEach(id => { $(id).hidden = !on; });
    if (!on) return;
    const p = State.params;
    const needed = Math.ceil(p.peakpower / CONFIG.PANEL_KWP - 1e-9);
    const toLL = r => Roof.toLatLng(r, info.o);
    MapView.showRoof(State.roof.latlngs,
      info.panels.slice(0, needed).map(toLL), info.panels.slice(needed).map(toLL), { fit });

    // Score: three transparent 0–100 notes, explained in the "?" tooltip.
    const clamp = x => Math.max(0, Math.min(100, Math.round(x)));
    const notes = {
      roof: clamp(100 * info.capacityKw / Math.max(m.targetKw, 0.5)),
      sun: clamp(100 * (m.yieldPerKw - 1200) / (1900 - 1200)),
      roi: isFinite(m.paybackYr) ? clamp(100 * (15 - m.paybackYr) / (15 - 4)) : 0,
    };
    const score = Math.round((notes.roof + notes.sun + notes.roi) / 3);
    const tone = v => v >= 70 ? "good" : v >= 45 ? "fair" : "low";
    $("roof-score").textContent = score;
    const ring = $("roof-ring"), C = 2 * Math.PI * 52;
    ring.style.strokeDasharray = `${C * score / 100} ${C}`;
    ring.setAttribute("class", "ring-fg " + tone(score));
    for (const [k, v] of Object.entries(notes)) {
      const bar = $("bar-" + k);
      bar.style.width = v + "%";
      bar.className = tone(v);
      $("val-" + k).textContent = v;
    }

    const shown = Math.min(needed, info.panels.length);
    $("st-area").textContent = `${fmtNum(info.areaM2)} m²`;
    $("st-area-sub").textContent = State.roof.src === "osm" ? "d'après OpenStreetMap" : "toit dessiné";
    const plus = info.capped ? "+" : "";
    $("st-max").textContent = `${fmtNum(info.capacityKw)}${plus} kWc`;
    $("st-max-sub").textContent = `${info.panels.length}${plus} panneaux`;
    $("st-inst").textContent = `${fmtDec(p.peakpower, { trim: true })} kWc`;
    $("st-inst-sub").textContent = `${shown} panneau${shown > 1 ? "x" : ""} · ${fmtNum(shown * CONFIG.PANEL_W_M * CONFIG.PANEL_L_M)} m²`;

    let html = `Panneaux de 500 Wc, ${CONFIG.ROOF_SETBACK_M} m de marge sur les bords, rangées espacées pour éviter l'ombre.`;
    if (needed > info.panels.length) {
      html = `<span class="roof-warn">Votre toit ne permet que ${info.panels.length} des ${needed} panneaux de cette installation.</span> ` + html;
    }
    this.setRoofInfo(html);
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
    $("peakpower-val").textContent = fmtDec(p.peakpower) + " kWc";
    const nPanels = Math.ceil(p.peakpower / CONFIG.PANEL_KWP - 1e-9);
    $("peakpower-hint").textContent =
      `${nPanels} panneaux de ${CONFIG.PANEL_KWP * 1000} Wc, ≈ ${Math.round(nPanels * CONFIG.PANEL_W_M * CONFIG.PANEL_L_M)} m²`;
    $("angle-val").textContent = p.angle + "°";
    $("aspect-val").textContent = aspectLabel(p.aspect);
    $("cost-val").textContent = fmtDec(p.cost) + " MAD/Wc";
    $("next-cost").textContent = fmtDec(p.cost, { trim: true }) + " MAD/Wc";
    const capex = p.peakpower * 1000 * p.cost;
    $("capex-hint").textContent = `Investissement total : ${fmtMAD(capex)}`;
  },

  async recalc({ force = false, fitRoof = false } = {}) {
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
      const seq = ++State.pvSeq;
      this.setHeroLoading(true);
      let perKw;
      try {
        perKw = await PVGIS.fetchPerKw({
          lat: State.location.lat,
          lon: State.location.lon,
          angle: p.angle,
          aspect: p.aspect,
        });
        $("step2-error").hidden = true;
      } catch (e) {
        console.error(e);
        Analytics.track("pvgis_fallback", {});
        // Degrade to the nearest-city estimate rather than a dead end.
        perKw = PVGIS.fallbackPerKw(State.location.lat, State.location.lon);
      }
      // A newer request (new address or orientation) owns the result now;
      // an older response arriving late must not overwrite it.
      if (seq !== State.pvSeq) return;
      State.lastPerKw = perKw;
      State.lastPvKey = key;
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
    const roofInfo = this.roofLayout();
    const targetKw = (consumption * 12 * CONFIG.AUTOSIZE_COVER) / State.lastPerKw.yieldPerKw;
    if (State.sizeAuto) {
      // Never recommend more than the roof holds (when the roof is known).
      const roofMax = roofInfo ? Math.floor(roofInfo.capacityKw * 2) / 2 : Infinity;
      p.peakpower = Math.min(10, roofMax, Math.max(1, Math.round(targetKw * 2) / 2));
      p.peakpower = Math.max(1, p.peakpower);
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
    this.renderRoof(roofInfo, { targetKw, yieldPerKw: State.lastPerKw.yieldPerKw, paybackYr: roi.paybackYr }, { fit: fitRoof });

    // Hero
    const savings = Math.round(roi.annualSavingsMAD);
    State.savings = savings;
    countUp($("hero-savings"), savings, State.heroAnimated ? 0 : 900);
    State.heroAnimated = true;
    $("chip-size").textContent = fmtDec(p.peakpower, { trim: true }) + " kWc";
    $("chip-production").textContent = fmtNum(pv.annualKwh) + " kWh";
    $("chip-payback").textContent = isFinite(roi.paybackYr) ? fmtDec(roi.paybackYr) + " ans" : "—";
    const co2Tons = (pv.annualKwh * CONFIG.CO2_KG_PER_KWH) / 1000;
    $("chip-co2").textContent = fmtDec(co2Tons) + " t";

    // Financing card
    const loanMonthly = Finance.monthlyPayment(capexMAD, CONFIG.LOAN_APR, CONFIG.LOAN_YEARS);
    const pvMonthlySavings = roi.annualSavingsMAD / 12;
    const cashflowY1 = roi.annualSavingsMAD - capexMAD * CONFIG.OPEX_PCT_CAPEX_YR;
    $("fin-cash-capex").innerHTML = `${fmtNum(capexMAD)} <span class="unit">MAD</span>`;
    $("fin-cash-net").textContent = `Économie an 1 : ${fmtMAD(cashflowY1)}`;
    $("fin-cash-payback").textContent = isFinite(roi.paybackYr)
      ? `Amorti en ${fmtDec(roi.paybackYr)} ans`
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

    // Queued before the charts render: if Chart.js failed to load from its
    // CDN the calls below throw, and that is precisely the session we most
    // want recorded. Debounced so a slider drag reports the value the
    // visitor settled on, not every intermediate frame.
    clearTimeout(this._outcomeTimer);
    this._outcomeTimer = setTimeout(() => {
      Analytics.track("outcome", {
        bill: p.bill,
        kwp: p.peakpower,
        payback: isFinite(roi.paybackYr) ? Math.round(roi.paybackYr * 10) / 10 : 0,
        savings: Math.round(roi.annualSavingsMAD),
      });
    }, 2500);

    this.syncUrlSoon();
    Chart_.renderMonthly(pv.monthlyKwh);
    Chart_.renderCashflow(roi.cashflow);
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
// On desktop a tip is placed against the viewport (position: fixed), so a
// card with overflow: hidden or the scrolling summary column can't clip it,
// and it is clamped inside the window. Phones keep the CSS bottom sheet.
const Tooltips = {
  desktop: window.matchMedia("(min-width: 901px) and (hover: hover)"),
  place(btn) {
    const tip = btn.querySelector(".tip");
    if (!tip) return;
    if (!this.desktop.matches) { tip.removeAttribute("style"); tip.classList.remove("below"); return; }
    const r = btn.getBoundingClientRect();
    Object.assign(tip.style, {
      position: "fixed", width: "max-content", maxWidth: Math.min(260, innerWidth - 24) + "px",
      transform: "none", bottom: "auto",
    });
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12));
    const above = r.top - h - 10 >= 8;
    tip.style.left = left + "px";
    tip.style.top = (above ? r.top - h - 10 : r.bottom + 10) + "px";
    tip.style.setProperty("--arrow-x", (r.left + r.width / 2 - left) + "px");
    tip.classList.toggle("below", !above);
  },
  closeAll(except) {
    document.querySelectorAll(".help.open").forEach(h => { if (h !== except) h.classList.remove("open"); });
  },
  init() {
    const placeFrom = (e) => { const b = e.target.closest && e.target.closest(".help"); if (b) this.place(b); };
    document.addEventListener("mouseover", placeFrom);
    document.addEventListener("focusin", placeFrom);
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".help");
      this.closeAll(btn);
      if (btn) {
        e.preventDefault();
        this.place(btn);
        btn.classList.toggle("open");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.closeAll();
    });
    // A fixed tip would float away from its button on scroll.
    window.addEventListener("scroll", () => this.closeAll(), { passive: true, capture: true });
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
// One decimal with a French decimal comma: 2,5 · 10,2. Whole values drop
// the ",0" when `trim` is set (3 kWc, not 3,0 kWc).
function fmtDec(n, { trim = false } = {}) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: trim && Number.isInteger(n) ? 0 : 1, maximumFractionDigits: 1 });
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
// Morocco, Southern Provinces included.
function inMorocco(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= 20.5 && lat <= 36.1 && lon >= -17.3 && lon <= -0.9;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Which sections visitors actually reach. Answers "is the financing card
// worth the space it takes?" without anyone having to guess.
const Depth = {
  init() {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        Analytics.once("depth:" + en.target.dataset.depth, "depth", { section: en.target.dataset.depth });
        io.unobserve(en.target);
      });
    }, { threshold: 0.01 });
    document.querySelectorAll("[data-depth]").forEach(el => io.observe(el));
  },
};

// Boot. Every script tag is `defer`, so on DOMContentLoaded Leaflet, Chart.js
// and analytics.js are already there; "load" would also wait for images.
document.addEventListener("DOMContentLoaded", () => {
  Analytics.init();
  Chart_.init();
  UI.init();
  Tooltips.init();
  Depth.init();
});
