/* Pumping engine tests — `node solar/pumping.test.mjs`. One real field
 * (Taroudant, PVGIS and ET₀ fetched 7 Nov 2026) worked by hand, then the
 * edge cases the page relies on.
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const engine = require("./engine.js");
Object.assign(globalThis, { CONFIG: engine.CONFIG, Finance: engine.Finance });
const { PUMP_CONFIG, PUMP_YIELD, Pumping } = require("./pumping.js");

let fail = 0;
const ok = (name, cond, extra = "") => { console.log((cond ? "PASS" : "FAIL") + " — " + name + (extra ? "  " + extra : "")); if (!cond) fail++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Yields derived from the Nebraska criteria × 76 %
ok("electric pump ≈ 0.50 kWh of water work per kWh", near(PUMP_YIELD.elec, 0.50, 0.005), PUMP_YIELD.elec.toFixed(3));
ok("diesel ≈ 1.87 kWh per litre", near(PUMP_YIELD.dieselL, 1.87, 0.01), PUMP_YIELD.dieselL.toFixed(3));
ok("butane ≈ 1.98 kWh per kg", near(PUMP_YIELD.butaneKg, 1.98, 0.01), PUMP_YIELD.butaneKg.toFixed(3));

// Taroudant (30.47 N, 8.88 W): PVGIS PVcalc 1 kWc, ground, 20° south, 14 % loss
const pv = [133.16, 129.81, 156.26, 159.31, 160.66, 153.55, 157.21, 152.16, 141.89, 135.55, 122.29, 125.58];
// /et0 for the same point (FAO-56 on PVGIS TMY)
const et0 = [2.45, 2.81, 4.53, 5.08, 5.99, 5.68, 7.12, 6.02, 5.79, 4.83, 2.38, 2.12];

// 2 ha of olives, drip, water at 60 m, into a basin 3 m up
const head = Pumping.headM({ depthM: 60, outlet: "basin", liftM: 3 });
ok("head = (60 + 3) × 1.10 = 69.3 m", near(head, 69.3, 1e-9), head);
const need = Pumping.needFromCrop({ et0, crop: "olive", ha: 2, method: "drip" });
ok("July need = 7.12 × 0.70 × 10 × 2 / 0.9 = 110.8 m³/day", near(need[6], 110.76, 0.01), need[6].toFixed(2));
ok("no water outside April–October", need[0] === 0 && need[2] === 0 && need[10] === 0 && need[3] > 0);

const s = Pumping.size({ needDay: need, pvPerKw: pv, headM: head });
// July: 110.76 × 0.002725 × 69.3 = 20.92 kWh/day of water work; per kWc
// 157.21 / 31 × 0.90 × 0.50 = 2.282 → 9.17 kWc → 19 panels, 9.5 kWc
ok("peak month is July", s.peakMonth === 6, s.peakMonth);
ok("19 panels, 9.5 kWc", s.panels === 19 && s.kwp === 9.5, `${s.panels} / ${s.kwp}`);
ok("pump 10 CV (9.5 / 1.3 = 7.3 kW)", s.pumpCv === 10, s.pumpCv);
ok("the array covers every month's need", s.pumpedDay.every((v, i) => near(v, need[i], 1e-9)));
ok("basin = one July day", near(s.basinM3, need[6], 1e-9));
ok("peak flow ≈ 110.8 / 5.07 h ≈ 21.8 m³/h", near(s.peakFlowM3h, 21.84, 0.05), s.peakFlowM3h.toFixed(2));

const price = Pumping.kitPriceMAD(s.pumpKw);
ok("kit price on the catalogue curve (7.4 kW → ≈ 70 000 DH)", price >= 65000 && price <= 75000, price);
ok("curve passes through the catalogue points (±6 %)",
  [[2.2, 30900], [5.5, 55000], [15, 114600]].every(([kw, mad]) => near(Pumping.kitPriceMAD(kw) / mad, 1, 0.06)));

const b = Pumping.baseline({ source: "butane", needDay: need, headM: head });
const { m3, kwhHyd } = Pumping.yearly(need, head);
ok("yearly volume ≈ 19 000 m³ (≈ 9 500 m³/ha)", m3 > 17000 && m3 < 21000, Math.round(m3));
ok("bottles = water work / 1.98 / 12", near(b.bottles, kwhHyd / PUMP_YIELD.butaneKg / 12, 1e-6), b.bottles.toFixed(0));
ok("butane cost = bottles × 50 DH", near(b.mad, b.bottles * 50, 1e-6) && b.estimated);

const e = Pumping.economics({ priceMAD: price, baselineMAD: b.mad, peakDays: Pumping.peakDaysEquivalent(need) });
ok("aid capped at 30 000 DH or 30 %", e.aidMAD === Math.min(price * 0.3, 30000), e.aidMAD);
ok("payback with aid is shorter", e.paybackAidYr < e.paybackYr, `${e.paybackYr.toFixed(1)} → ${e.paybackAidYr.toFixed(1)}`);

// The farmer's own figures win over the estimate
const own = Pumping.baseline({ source: "butane", needDay: need, headM: head, own: 10 });
const peakDays = Pumping.peakDaysEquivalent(need);
ok("10 bottles a week in July → 10/7 × peak-equivalent days", near(own.bottles, (10 / 7) * peakDays, 1e-9) && !own.estimated, own.bottles.toFixed(0));
ok("grid without a bill → no estimate", Pumping.baseline({ source: "grid", needDay: need, headM: head }) === null);
const grid = Pumping.baseline({ source: "grid", needDay: need, headM: head, own: 1500 });
ok("grid bill 1 500 DH in July → a year shaped like the need", grid && near(grid.mad, 1500 * 12 / 365 * peakDays, 1e-6), grid && grid.mad.toFixed(0));

// Drip against surface irrigation: the same field needs 1.5× the water
const surf = Pumping.needFromCrop({ et0, crop: "olive", ha: 2, method: "surface" });
ok("surface / drip = 0.9 / 0.6", near(surf[6] / need[6], 1.5, 1e-9));

// The farmer's own volume, shaped by ET₀
const vol = Pumping.needFromVolume({ et0, m3PeakDay: 50, months: [5, 6, 7, 8] });
ok("own volume: 50 m³ in the peak month, less in May", near(vol[6], 50, 1e-9) && vol[4] < 50 && vol[0] === 0);

// Tiny needs still get a real system
const tiny = Pumping.size({ needDay: Pumping.needFromVolume({ et0, m3PeakDay: 2, months: [7] }), pvPerKw: pv, headM: 10 });
ok("at least 2 panels and a 1 CV pump", tiny.panels === 2 && tiny.pumpCv === 1, `${tiny.panels} / ${tiny.pumpCv}`);

console.log(fail ? "\n" + fail + " FAILURE(S)" : "\nall green");
process.exit(fail ? 1 : 0);
