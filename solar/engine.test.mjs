// Engine tests: node solar/engine.test.mjs (no framework, no install).
import engine from "./engine.js";
const { CONFIG, PV, Tariff, ROI, Sizing, Quote } = engine;

let failed = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}${cond || !detail ? "" : "  " + detail}`);
  if (!cond) failed++;
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ── Tariff: progressive up to 150 kWh, selective above ────────────────
ok("120 kWh: each tranche at its price", near(Tariff.monthBill(120), 100 * 0.9010 + 20 * 1.0732));
ok("150 kWh: still progressive", near(Tariff.monthBill(150), 100 * 0.9010 + 50 * 1.0732));
ok("170 kWh: whole month in tranche 3", near(Tariff.monthBill(170), 170 * 1.0732));
ok("250 kWh: whole month in tranche 4", near(Tariff.monthBill(250), 250 * 1.1676));
ok("tolerance: 210 kWh stays in tranche 3, 211 moves", near(Tariff.monthBill(210), 210 * 1.0732) && near(Tariff.monthBill(211), 211 * 1.1676));
ok("tolerance: 310 / 311 and 510 / 511", near(Tariff.monthBill(310), 310 * 1.1676) && near(Tariff.monthBill(311), 311 * 1.3817)
  && near(Tariff.monthBill(510), 510 * 1.3817) && near(Tariff.monthBill(511), 511 * 1.5958));
ok("bounds as the distributors print them", [2, 3, 4, 5].map(i => Tariff.trancheBounds(i)).map(b => `${b.from + 1}-${b.to}`).join(" ") === "151-210 211-310 311-510 511-Infinity");
ok("one kWh over a threshold costs more than a kWh", Tariff.monthBill(311) - Tariff.monthBill(310) > 60);
ok("saved: dropping a tranche beats the tranche price", Tariff.saved(330, 60) / 60 > 1.5958 && near(Tariff.saved(400, 60) / 60, 1.3817));
ok("saved: never more solar than consumption", near(Tariff.saved(100, 500), Tariff.monthBill(100)));

// ── Bill ↔ kWh over a year ─────────────────────────────────────────────
ok("season factors average 1", near(CONFIG.CONSUMPTION_SEASON.reduce((a, b) => a + b, 0), 12));
let prev = 0, mono = true, close = true;
for (let b = 100; b <= 3000; b += 25) {
  const k = Tariff.kwhFromBill(b), back = Tariff.billFromKwh(k);
  if (k < prev) mono = false;
  if (back > b + 1e-6 || b - back > 30) close = false;   // three months share a factor and cross together
  prev = k;
}
ok("kwhFromBill rises with the bill", mono);
ok("billFromKwh(kwhFromBill(b)) is b, or just under at a step", close);

// ── Self-consumption ──────────────────────────────────────────────────
const sc = CONFIG.selfConsumptionRatio;
ok("tiny system: used almost entirely", sc(0.05, "mixed") > 0.93 && sc(0, "mixed") === 1);
ok("falls as the system grows", sc(0.5, "mixed") > sc(1, "mixed") && sc(1, "mixed") > sc(2, "mixed"));
ok("a big system serves at most D of the consumption", [1, 2, 4].every(r => sc(r, "mixed") * r <= CONFIG.SELF_USE_PROFILES.mixed + 1e-9));
ok("more at home in daytime, more used on site", sc(1, "away") < sc(1, "mixed") && sc(1, "mixed") < sc(1, "home"));
ok("unknown profile falls back to the default", sc(1, "nope") === sc(1, CONFIG.DEFAULT_PROFILE));

// ── ROI and sizing ────────────────────────────────────────────────────
const perKw = PV.fallbackPerKw(33.57, -7.59);   // Casablanca
const cons = Tariff.kwhFromBill(800);
const roi = (kw, extra = {}) => ROI.compute({ pv: PV.scale(perKw, kw), monthlyConsumption: cons, capexMAD: kw * 11000, exportAllowed: false, ...extra });
const r = roi(2.5);
ok("savings never exceed the year's bills", r.annualSavingsMAD <= Tariff.billFromKwh(cons) * 12 + 1e-6);
ok("self-consumed kWh never exceed production or consumption", r.annualSelfKwh <= PV.scale(perKw, 2.5).annualKwh && r.annualSelfKwh <= cons * 12);
ok("export adds at most 20 % of production at the export price", (() => {
  const x = roi(6, { exportAllowed: true }), n = roi(6);
  return x.annualExportKwh <= 6 * perKw.yieldPerKw * CONFIG.EXPORT_CAP_PCT + 1e-6 && near(x.annualSavingsMAD - n.annualSavingsMAD, x.annualExportMAD);
})());
ok("payback = capex / (savings − opex)", near(r.paybackYr, 27500 / (r.annualSavingsMAD - 275)));
const { quick, best, all } = Sizing.options({ perKw, monthlyKwh: cons });
ok("best has the highest NPV", all.every(o => o.roi.npv <= best.roi.npv + 1e-6));
ok("quick is no bigger than best and pays back sooner or as soon", quick.kw <= best.kw && quick.roi.paybackYr <= best.roi.paybackYr + 1e-9);
ok("quick is within the slack of the shortest payback", quick.roi.paybackYr <= Math.min(...all.map(o => o.roi.paybackYr)) + CONFIG.QUICK_PAYBACK_SLACK_YR + 1e-9);
ok("sizes stay within the roof", Sizing.options({ perKw, monthlyKwh: Tariff.kwhFromBill(2500), roofMaxKw: 2.2 }).best.kw <= 2);
ok("a roof under the minimum still gets the minimum size", Sizing.options({ perKw, monthlyKwh: cons, roofMaxKw: 0.4 }).all.length === 1);
ok("verdict thresholds", Sizing.verdict(6) === "go" && Sizing.verdict(10) === "maybe" && Sizing.verdict(13) === "wait" && Sizing.verdict(Infinity) === "wait");
const be = Sizing.breakEvenCostPerWc(best);
ok("at the break-even price the payback is the target", near(ROI.compute({ pv: best.pv, monthlyConsumption: cons, capexMAD: best.kw * 1000 * be, exportAllowed: false }).paybackYr, CONFIG.PAYBACK_BREAKEVEN_YR, 1e-6));
const bb = Sizing.breakEvenBill({ perKw, costPerWc: 11 });
ok("break-even bill: pays back there, not 25 MAD below", bb !== null
  && Sizing.options({ perKw, monthlyKwh: Tariff.kwhFromBill(bb) }).quick.roi.paybackYr <= CONFIG.PAYBACK_BREAKEVEN_YR
  && Sizing.options({ perKw, monthlyKwh: Tariff.kwhFromBill(bb - 25) }).quick.roi.paybackYr > CONFIG.PAYBACK_BREAKEVEN_YR, String(bb));

// ── Quote ─────────────────────────────────────────────────────────────
ok("quote levels", Quote.check({ kw: 3, priceMAD: 21000 }).level === "low" && Quote.check({ kw: 3, priceMAD: 33000 }).level === "fair"
  && Quote.check({ kw: 3, priceMAD: 42000 }).level === "high" && Quote.check({ kw: 3, priceMAD: 60000 }).level === "over");
ok("quote: price per Wc, and nothing for an empty form", near(Quote.check({ kw: 3, priceMAD: 42000 }).perWc, 14) && Quote.check({ kw: NaN, priceMAD: 1 }) === null);

console.log(failed ? `\n${failed} FAILED` : "\nall green");
process.exit(failed ? 1 : 0);
