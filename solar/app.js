/* Atlas Solar — Morocco residential PV estimator
 * ------------------------------------------------
 * Modules:
 *   CONFIG        constants that are easy to update (tariffs, cost, CO2, etc.)
 *   Geocoder      Nominatim (OSM) address → {lat, lon, label}
 *   PVGIS         EU JRC PVcalc API → annual + monthly kWh
 *   Tariff        ONEE stepped tariff, avoided cost per kWh
 *   ROI           payback, cashflow, NPV
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
const PVGIS = {
  async fetch({ lat, lon, peakpower, angle, aspect }) {
    const params = new URLSearchParams({
      lat: lat.toFixed(4),
      lon: lon.toFixed(4),
      peakpower: String(peakpower),
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
      annualKwh: totals.E_y,                       // kWh/year
      specificYield: totals.E_y / peakpower,       // kWh/kWc/year
      monthlyKwh: monthly.map(m => m.E_m),         // 12 values, kWh/month
      radiationAnnual: totals["H(i)_y"],           // kWh/m²/year
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
      // Fully open default: OSM standard tiles. No token, no account, ODbL data.
      const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(this.map);
      // Optional satellite view (Esri World Imagery — token-free, not open data).
      const satellite = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
        }
      );
      L.control.layers(
        { "Plan (OSM)": osm, "Satellite": satellite },
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
    peakpower: 3,
    angle: 30,
    aspect: 0,
    consumption: 300,
    cost: 11,
    exportAllowed: false,
  },
  lastPvKey: null,
  lastPv: null,
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
    ["peakpower", "angle", "aspect", "consumption", "cost"].forEach(id => {
      const input = $(id);
      input.addEventListener("input", () => {
        State.params[id] = parseFloat(input.value);
        this.renderParamLabels();
        this.recalc();
      });
    });
    $("export-toggle").addEventListener("change", (e) => {
      State.params.exportAllowed = e.target.checked;
      this.recalc();
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
    this.goToStep(2);
    $("location-label").textContent = loc.label || `${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)}`;
    $("coords-label").textContent = `${loc.lat.toFixed(4)}°N, ${Math.abs(loc.lon).toFixed(4)}°${loc.lon < 0 ? "W" : "E"}`;
    MapView.set(loc.lat, loc.lon, loc.label);
    await this.recalc({ force: true });
  },

  goToStep(n) {
    $("step1").classList.toggle("active", n === 1);
    $("step2").classList.toggle("active", n === 2);
    if (n === 1) window.scrollTo({ top: 0, behavior: "smooth" });
  },

  renderParamLabels() {
    const p = State.params;
    $("peakpower-val").textContent = p.peakpower.toFixed(1) + " kWc";
    $("peakpower-hint").textContent = `≈ ${Math.round(p.peakpower * CONFIG.M2_PER_KWP)} m² de panneaux`;
    $("angle-val").textContent = p.angle + "°";
    $("aspect-val").textContent = aspectLabel(p.aspect);
    $("consumption-val").textContent = p.consumption + " kWh";
    $("tranche-hint").textContent = Tariff.activeTrancheLabel(p.consumption);
    $("cost-val").textContent = p.cost.toFixed(1) + " MAD/Wc";
    const capex = p.peakpower * 1000 * p.cost;
    $("capex-hint").textContent = `Investissement total : ${fmtMAD(capex)}`;
  },

  async recalc({ force = false } = {}) {
    if (!State.location) return;
    const p = State.params;
    // Only re-hit PVGIS if lat/lon/size/angle/aspect changed
    const key = [
      State.location.lat.toFixed(4),
      State.location.lon.toFixed(4),
      p.peakpower, p.angle, p.aspect,
    ].join("|");

    let pv = State.lastPv;
    if (force || key !== State.lastPvKey) {
      try {
        pv = await PVGIS.fetch({
          lat: State.location.lat,
          lon: State.location.lon,
          peakpower: p.peakpower,
          angle: p.angle,
          aspect: p.aspect,
        });
        State.lastPvKey = key;
        State.lastPv = pv;
        $("step2-error").hidden = true;
      } catch (e) {
        console.error(e);
        const el = $("step2-error");
        el.textContent = e.message || "Erreur de calcul — réessayez.";
        el.hidden = false;
        return;
      }
    }

    const capexMAD = p.peakpower * 1000 * p.cost;
    const roi = ROI.compute({
      pv,
      monthlyConsumption: p.consumption,
      capexMAD,
      exportAllowed: p.exportAllowed,
    });

    // KPIs
    $("kpi-production").innerHTML = `${fmtNum(pv.annualKwh)} <span class="unit">kWh</span>`;
    $("kpi-yield").textContent = `${Math.round(pv.specificYield)} kWh/kWc/an`;
    $("kpi-savings").innerHTML = `${fmtNum(roi.annualSavingsMAD)} <span class="unit">MAD</span>`;
    $("kpi-selfratio").textContent = `Autoconsommation ${Math.round(roi.selfRatio*100)} %`;
    $("kpi-payback").innerHTML = isFinite(roi.paybackYr)
      ? `${roi.paybackYr.toFixed(1)} <span class="unit">ans</span>`
      : `— <span class="unit">n/a</span>`;
    $("kpi-capex").textContent = `Sur 25 ans : ${fmtMAD(roi.lifetimeSavingsMAD)} nets`;
    const co2Tons = (pv.annualKwh * CONFIG.CO2_KG_PER_KWH) / 1000;
    $("kpi-co2").innerHTML = `${co2Tons.toFixed(2)} <span class="unit">t</span>`;

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
    $("fin-rate-note").textContent = `TAEG ${(CONFIG.LOAN_APR*100).toFixed(1)} % · ${CONFIG.LOAN_YEARS*12} mensualités`;

    Chart_.renderMonthly(pv.monthlyKwh);
    Chart_.renderCashflow(roi.cashflow, roi.paybackYr);
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

// ── Helpers ────────────────────────────────────────
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
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
window.addEventListener("load", () => UI.init());
