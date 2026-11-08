// The ONEE tariff and the savings it gives: the figures every page rests on.
// node solar/engine.test.mjs  (no dependency; CI runs it in solar.yml)
//
// ONEE residential LV billing (reform of 2014, one.org.ma « Tarifs »):
//   ≤ 150 kWh a month   progressive, each tranche at its own price;
//   > 150 kWh a month   selective, the whole month at the price of the
//                       tranche reached, 10 kWh tolerance over each bound.
import engine from "./engine.js";

const { CONFIG, Tariff, ROI } = engine;
let failed = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + detail}`);
  if (!cond) failed++;
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ── 1. Bill for a consumption ──────────────────────────────────────────
const bill = Tariff.billFromKwh;
for (const [kwh, want, why] of [
  [0, 0, "nothing used"],
  [80, 80 * 0.9010, "first tranche"],
  [100, 90.10, "first tranche, full"],
  [150, 100 * 0.9010 + 50 * 1.0732, "progressive up to 150"],
  [151, 151 * 1.0732, "selective from 151: the whole month at 1.0732"],
  [210, 210 * 1.0732, "151–200 tranche + 10 kWh tolerance"],
  [211, 211 * 1.1676, "past the tolerance: the whole month at 1.1676"],
  [310, 310 * 1.1676, "201–300 tranche + tolerance"],
  [311, 311 * 1.3817, "301–500 tranche"],
  [510, 510 * 1.3817, "301–500 tranche + tolerance"],
  [511, 511 * 1.5958, "top tranche"],
  [900, 900 * 1.5958, "top tranche"],
]) ok(`bill(${kwh} kWh) = ${want.toFixed(2)} MAD — ${why}`, near(bill(kwh), want), bill(kwh).toFixed(4));

ok("the bill jumps at 150, 210, 310 and 510 kWh",
  [150, 210, 310, 510].every((k) => bill(k + 0.01) - bill(k) > 10));
let rising = true;
for (let k = 0; k < 2000; k += 0.5) if (bill(k + 0.5) < bill(k)) rising = false;
ok("the bill never falls when consumption rises", rising);

// ── 2. Consumption from a bill ─────────────────────────────────────────
let roundTrip = true;
for (let k = 0; k <= 2000; k += 0.25) if (!near(Tariff.kwhFromBill(bill(k)), k, 1e-6)) roundTrip = false;
ok("kwhFromBill(billFromKwh(k)) === k, 0–2000 kWh", roundTrip);
ok("a bill inside a jump maps to the threshold below it",
  Tariff.kwhFromBill(155) === 150 && Tariff.kwhFromBill(235) === 210 && Tariff.kwhFromBill(400) === 310 && Tariff.kwhFromBill(750) === 510);
ok("500 MAD ≈ 362 kWh (whole month at 1.3817)", near(Tariff.kwhFromBill(500), 500 / 1.3817));

// ── 3. Value of the kWh solar removes ──────────────────────────────────
const avoided = Tariff.avoidedCostPerKwh;
ok("progressive part: solar removes the 101–150 kWh first", near(avoided(140, 40), 1.0732));
ok("progressive part, across tranches", near(avoided(120, 40), (20 * 1.0732 + 20 * 0.9010) / 40));
ok("selective, same tranche: the tranche price", near(avoided(450, 100), 1.3817));
ok("selective, back under 310 kWh: the whole month's price drops too",
  near(avoided(400, 100), (400 * 1.3817 - 300 * 1.1676) / 100) && avoided(400, 100) > 2);
ok("never more kWh than consumed", near(avoided(100, 300), 0.9010));
ok("no solar, no saving", avoided(300, 0) === 0);

// ── 4. ROI uses that value ─────────────────────────────────────────────
const flat = (annual) => ({ annualKwh: annual, monthlyKwh: Array(12).fill(annual / 12) });
const r = ROI.compute({ pv: flat(1200), monthlyConsumption: 400, capexMAD: 22000, exportAllowed: false });
const self = 100 * r.selfRatio;
ok("ROI savings = 12 × the month's bill difference",
  near(r.annualSavingsMAD, 12 * (bill(400) - bill(400 - self)), 1e-6), `${r.annualSavingsMAD}`);
ok("CONFIG keeps the thresholds in one place",
  CONFIG.ONEE_PROGRESSIVE_MAX_KWH === 150 && CONFIG.ONEE_SELECTIVE_TOLERANCE_KWH === 10);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
