/* Wattu — solar pumping engine (solar/pompage/). Plain script like
 * engine.js, loaded after it: reads Finance and CONFIG.LOAN_* from it.
 * No DOM, no fetch, no page text. Node reads module.exports at the bottom
 * (pumping.test.mjs).
 *
 * The chain, month by month:
 *   water need (m³/day)   = ET₀ × Kc × area / irrigation efficiency
 *                           (or the farmer's own summer volume, shaped by ET₀)
 *   hydraulic energy      = 0.002725 kWh per m³ per metre of head
 *   PV energy per kWc     = PVGIS PVcalc at 1 kWc, ground-mounted
 *   array size            = enough for the most demanding irrigated month
 *   today's fuel          = the same hydraulic energy through an engine
 *                           (or the farmer's own bottles / litres / bill)
 *
 * Every figure below has its source next to it. Assumptions that have no
 * published source are named as such; the page lists them in « Méthode ».
 */

const PUMP_CONFIG = {
  // ρ·g / 3.6e6: kWh to lift 1 m³ by 1 m (physics)
  KWH_PER_M3_M: 0.002725,

  // Head losses in pipes and fittings, as a share of the static head.
  // Assumption (common rule of thumb for short farm pipework).
  FRICTION_SHARE: 0.10,
  // Pressure a drip line needs at its head (≈ 1 bar). Assumption.
  DRIP_PRESSURE_M: 10,

  // Pumping-plant performance: Nebraska Pumping Plant Performance Criteria
  // as published by the University of Georgia (Bulletin 837, « Irrigation
  // Pumping Plants and Energy Use »), in water-horsepower-hours per unit:
  // electricity 0.885 /kWh, diesel 12.5 /gal, butane 7.65 /gal. Field plants
  // average 76 % of these criteria (same bulletin, Nebraska tests). Small,
  // ageing engines in Moroccan wells often do worse: the fuel figures are
  // therefore on the low side, and so are the savings.
  WHP_H_KWH: 0.7457,
  FIELD_SHARE: 0.76,
  CRIT_ELEC_WHPH_PER_KWH: 0.885,
  CRIT_DIESEL_WHPH_PER_GAL: 12.5,
  CRIT_BUTANE_WHPH_PER_GAL: 7.65,
  GAL_L: 3.785,
  BUTANE_KG_PER_L: 0.58,          // liquid butane density (physics, ~15 °C)

  // Solar side: PVGIS gives the array's AC-side energy with 14 % losses
  // (cables, temperature, inverter ≈ pump drive). Low-light hours when the
  // pump cannot start and MPPT mismatch take a further share: assumption.
  SOLAR_UTILISATION: 0.90,
  PVGIS_ANGLE: 20,                // tilt for a summer-peaking need at 30–35°N (design choice)
  PVGIS_MOUNTING: "free",         // ground-mounted frame

  // Pump drives want an array 1.2–1.5× the pump's rating (manufacturers'
  // sizing rule): 1.3 is the middle. Assumption.
  PV_TO_PUMP: 1.3,
  CV_KW: 0.7355,                  // one cheval-vapeur (metric horsepower)
  PUMP_CV: [1, 1.5, 2, 3, 4, 5.5, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50],
  PANEL_KWP: 0.5,
  PANEL_GROUND_M2: 2.6 * 2,       // panel 2.58 m² + row spacing on the ground. Assumption.

  // Installed kit price (panels, frame, drive, pump, wiring, installation;
  // no borehole, no basin), MAD, as a function of pump power in kW.
  // Fitted (power law) to three catalogue prices of a Moroccan seller,
  // oasismaroc.com, seen 7 Nov 2026: 3 CV / 2.2 kW 30 900 DH, 7.5 CV /
  // 5.5 kW 55 000 DH, 20 CV / 15 kW 114 600 DH (promotional, with
  // installation). One seller: the page asks for the farmer's own quote.
  KIT_A: 18040,
  KIT_B: 0.683,
  OPEX_SHARE: 0.01,               // yearly upkeep, share of the kit price. Assumption.
  HORIZON_YR: 15,                 // horizon of « économies sur 15 ans »

  // FDA (Fonds de développement agricole) programme for solar pumping
  // (announced by the Agriculture minister, 2024): up to 30 % of the
  // purchase and installation, at most 30 000 DH per project; conditions
  // include having pumped with butane and fitting a water meter
  // (Le Desk, Hespress EN).
  FDA_SHARE: 0.30,
  FDA_CAP_MAD: 30000,

  // Fuel prices, November 2026.
  // Butane 12 kg: 50 DH (frozen; Médias24 25 Nov 2025, Le Desk 3 Apr 2026).
  // State subsidy 78 DH per bottle in April 2026 (Le Desk): ≈ 128 DH unsubsidised.
  BUTANE_BOTTLE_KG: 12,
  BUTANE_BOTTLE_MAD: 50,
  BUTANE_BOTTLE_UNSUBSIDISED_MAD: 128,
  // Diesel ≈ 16.90 DH/L after the 1 Nov 2026 rise (LesMRE, Finances News).
  DIESEL_MAD_PER_L: 16.9,

  // Emission factors: IPCC 2006 defaults (LPG 63.1 t CO₂/TJ at 47.3 MJ/kg,
  // diesel 74.1 t CO₂/TJ at 36 MJ/L); grid from engine.js CONFIG.
  CO2_KG_PER_KG_BUTANE: 2.98,
  CO2_KG_PER_L_DIESEL: 2.67,

  // Days of the year's peak need the basin should hold. Assumption.
  BASIN_DAYS: 1,
};

// kWh of water work per unit of fuel or electricity, field average
const PUMP_YIELD = {
  elec: PUMP_CONFIG.CRIT_ELEC_WHPH_PER_KWH * PUMP_CONFIG.WHP_H_KWH * PUMP_CONFIG.FIELD_SHARE,              // ≈ 0.50 per kWh
  dieselL: PUMP_CONFIG.CRIT_DIESEL_WHPH_PER_GAL * PUMP_CONFIG.WHP_H_KWH / PUMP_CONFIG.GAL_L * PUMP_CONFIG.FIELD_SHARE,  // ≈ 1.87 per L
  butaneKg: PUMP_CONFIG.CRIT_BUTANE_WHPH_PER_GAL * PUMP_CONFIG.WHP_H_KWH /
    (PUMP_CONFIG.GAL_L * PUMP_CONFIG.BUTANE_KG_PER_L) * PUMP_CONFIG.FIELD_SHARE,                           // ≈ 1.98 per kg
};

// Crop coefficients: FAO-56 (Allen et al. 1998), Table 12, mid-season
// values, held constant over the irrigated months (a simplification the
// page states). Irrigated months by default: a usual Moroccan calendar,
// which the farmer changes with the month buttons.
const CROPS = {
  olive:     { kc: 0.70, months: [4, 5, 6, 7, 8, 9, 10] },          // olives, 40–60 % ground cover
  citrus:    { kc: 0.65, months: [3, 4, 5, 6, 7, 8, 9, 10, 11] },   // citrus, ~70 % canopy, no ground cover
  date_palm: { kc: 0.95, months: [3, 4, 5, 6, 7, 8, 9, 10, 11] },   // date palms
  almond:    { kc: 0.90, months: [4, 5, 6, 7, 8, 9] },              // almonds / apples, no ground cover
  alfalfa:   { kc: 0.95, months: [3, 4, 5, 6, 7, 8, 9, 10] },       // alfalfa hay, averaged cutting effects
  vegetable: { kc: 1.05, months: [3, 4, 5, 6, 7] },                 // tomato, potato, onion: season average
  cereal:    { kc: 1.00, months: [2, 3, 4] },                       // wheat, supplementary spring irrigation
};

// Application efficiency: FAO Irrigation Water Management Training Manual
// no. 4 (Brouwer et al., 1989): surface 60 %, sprinkler 75 %, drip 90 %.
const IRRIGATION_EFF = { drip: 0.90, sprinkler: 0.75, surface: 0.60 };

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const Pumping = {
  // Total head, m: water depth while pumping + where it goes + friction.
  headM({ depthM, outlet, liftM = 0 }) {
    const pressure = outlet === "drip" ? PUMP_CONFIG.DRIP_PRESSURE_M : 0;
    return (Math.max(0, depthM) + Math.max(0, liftM) + pressure) * (1 + PUMP_CONFIG.FRICTION_SHARE);
  },

  // m³/day for each month from the crop (0 outside the irrigated months).
  needFromCrop({ et0, crop, ha, method, months }) {
    const c = CROPS[crop], eff = IRRIGATION_EFF[method];
    const on = new Set(months || c.months);
    // 1 mm over 1 ha = 10 m³
    return et0.map((e, i) => (on.has(i + 1) ? (e * c.kc * 10 * ha) / eff : 0));
  },

  // m³/day for each month from the farmer's peak-summer volume, shaped by
  // ET₀ over the irrigated months.
  needFromVolume({ et0, m3PeakDay, months }) {
    const on = new Set(months);
    const peak = Math.max(...et0.filter((_, i) => on.has(i + 1)), 0.01);
    return et0.map((e, i) => (on.has(i + 1) ? (m3PeakDay * e) / peak : 0));
  },

  // The system for a need. pvPerKw: PVGIS monthly kWh at 1 kWc.
  size({ needDay, pvPerKw, headM }) {
    const K = PUMP_CONFIG.KWH_PER_M3_M;
    const yieldPerKw = pvPerKw.map((kwh, i) =>
      (kwh / DAYS_IN_MONTH[i]) * PUMP_CONFIG.SOLAR_UTILISATION * PUMP_YIELD.elec); // kWh of water work per kWc per day
    let need = 0, peakMonth = -1;
    needDay.forEach((v, i) => {
      if (v <= 0) return;
      const kw = (v * K * headM) / yieldPerKw[i];
      if (kw > need) { need = kw; peakMonth = i; }
    });
    const panels = Math.max(2, Math.ceil(need / PUMP_CONFIG.PANEL_KWP - 1e-9));
    const kwp = panels * PUMP_CONFIG.PANEL_KWP;
    const capacityDay = yieldPerKw.map((y) => (kwp * y) / (K * headM));      // what the array can lift, m³/day
    const pumpedDay = needDay.map((v, i) => Math.min(v, capacityDay[i]));
    const pumpKwMin = kwp / PUMP_CONFIG.PV_TO_PUMP;
    const pumpCv = PUMP_CONFIG.PUMP_CV.find((cv) => cv * PUMP_CONFIG.CV_KW >= pumpKwMin * 0.95) ||
      PUMP_CONFIG.PUMP_CV[PUMP_CONFIG.PUMP_CV.length - 1];
    // Flow at full sun in the peak month: the day's volume over its
    // equivalent full-power hours.
    const sunHours = peakMonth >= 0 ? pvPerKw[peakMonth] / DAYS_IN_MONTH[peakMonth] : 0;
    return {
      panels, kwp,
      pumpCv, pumpKw: pumpCv * PUMP_CONFIG.CV_KW,
      peakMonth,
      capacityDay, pumpedDay,
      peakFlowM3h: sunHours > 0 ? needDay[peakMonth] / sunHours : 0,
      groundM2: panels * PUMP_CONFIG.PANEL_GROUND_M2,
      basinM3: peakMonth >= 0 ? needDay[peakMonth] * PUMP_CONFIG.BASIN_DAYS : 0,
    };
  },

  kitPriceMAD(pumpKw) {
    return Math.round((PUMP_CONFIG.KIT_A * Math.pow(pumpKw, PUMP_CONFIG.KIT_B)) / 500) * 500;
  },

  fdaAidMAD(priceMAD) {
    return Math.min(priceMAD * PUMP_CONFIG.FDA_SHARE, PUMP_CONFIG.FDA_CAP_MAD);
  },

  // Volume per year, m³, and water work per year, kWh.
  yearly(needDay, headM) {
    const m3 = needDay.reduce((a, v, i) => a + v * DAYS_IN_MONTH[i], 0);
    return { m3, kwhHyd: m3 * PUMP_CONFIG.KWH_PER_M3_M * headM };
  },

  // How the year's use compares with the peak month: Σ days × need/peak.
  // Turns « bottles a week in summer » into a year.
  peakDaysEquivalent(needDay) {
    const peak = Math.max(...needDay);
    return peak > 0 ? needDay.reduce((a, v, i) => a + (DAYS_IN_MONTH[i] * v) / peak, 0) : 0;
  },

  // What pumping the same water costs today, per year, MAD.
  //   source: "butane" | "diesel" | "grid" | "none"
  //   own: the farmer's figure for a summer week (bottles, litres) or
  //        month (grid bill, MAD), or null to estimate from the physics.
  baseline({ source, needDay, headM, own = null }) {
    const C = PUMP_CONFIG;
    const { kwhHyd } = Pumping.yearly(needDay, headM);
    const peakDays = Pumping.peakDaysEquivalent(needDay);
    if (source === "butane" || source === "none") {
      const kg = own != null ? (own / 7) * peakDays * C.BUTANE_BOTTLE_KG : kwhHyd / PUMP_YIELD.butaneKg;
      const bottles = kg / C.BUTANE_BOTTLE_KG;
      return {
        estimated: own == null, bottles,
        mad: bottles * C.BUTANE_BOTTLE_MAD,
        madUnsubsidised: bottles * C.BUTANE_BOTTLE_UNSUBSIDISED_MAD,
        co2Kg: kg * C.CO2_KG_PER_KG_BUTANE,
      };
    }
    if (source === "diesel") {
      const litres = own != null ? (own / 7) * peakDays : kwhHyd / PUMP_YIELD.dieselL;
      return { estimated: own == null, litres, mad: litres * C.DIESEL_MAD_PER_L, co2Kg: litres * C.CO2_KG_PER_L_DIESEL };
    }
    if (source === "grid") {
      // No published ONEE agricultural price is used: the farmer's bill only.
      if (own == null) return null;
      const mad = (own * 12 / 365) * peakDays;
      return { estimated: false, mad, co2Kg: (kwhHyd / PUMP_YIELD.elec) * CONFIG.CO2_KG_PER_KWH };
    }
    return null;
  },

  // Money: payback with and without the FDA aid, savings over the horizon,
  // and the loan's monthly payment next to today's monthly fuel spend.
  economics({ priceMAD, baselineMAD, peakDays }) {
    const C = PUMP_CONFIG;
    const opex = priceMAD * C.OPEX_SHARE;
    const net = baselineMAD - opex;
    const aid = Pumping.fdaAidMAD(priceMAD);
    const pay = (capex) => (net > 0 ? capex / net : Infinity);
    return {
      opexMAD: opex,
      netSavingsMAD: net,
      paybackYr: pay(priceMAD),
      aidMAD: aid,
      paybackAidYr: pay(priceMAD - aid),
      horizonSavingsMAD: net * C.HORIZON_YR - priceMAD,
      horizonSavingsAidMAD: net * C.HORIZON_YR - (priceMAD - aid),
      loanMonthlyMAD: Finance.monthlyPayment(priceMAD - aid, CONFIG.LOAN_APR, CONFIG.LOAN_YEARS),
      // A summer month of today's fuel: what the farmer feels in the pocket.
      fuelPeakMonthMAD: peakDays > 0 ? (baselineMAD / peakDays) * 30 : 0,
    };
  },
};

if (typeof module === "object" && module.exports) {
  module.exports = { PUMP_CONFIG, PUMP_YIELD, CROPS, IRRIGATION_EFF, DAYS_IN_MONTH, Pumping };
}
