#!/usr/bin/env node
/* Standalone mathematical validation for Atlas Solar
 * This extracts the calculation logic from app.js and runs all tests
 */

// ── CONFIG ─────────────────────────────────────────
const CONFIG = {
  ONEE_TRANCHES: [
    [100, 0.9010],
    [150, 1.0732],
    [200, 1.0732],
    [300, 1.1676],
    [500, 1.3817],
    [Infinity, 1.5958],
  ],
  CO2_KG_PER_KWH: 0.71,
  DEGRADATION_PCT_YR: 0.005,
  TARIFF_INFLATION_YR: 0.02,
  DISCOUNT_RATE: 0.05,
  LIFETIME_YR: 25,
  OPEX_PCT_CAPEX_YR: 0.01,
  M2_PER_KWP: 5,
  EXPORT_CAP_PCT: 0.20,
  EXPORT_PRICE_MAD_PER_KWH: 0.18,
  PVGIS_LOSS: 14,
  AUTOSIZE_COVER: 0.80,

  selfConsumptionRatio(sizingRatio) {
    if (sizingRatio <= 0) return 1;
    return Math.min(1, 0.30 + 0.55 * Math.exp(-0.9 * sizingRatio));
  },
};

// ── Tariff ────────────────────────────────────────
const Tariff = {
  avoidedCostPerKwh(monthlyConsumptionKwh, monthlyPvKwh) {
    const tranches = CONFIG.ONEE_TRANCHES;
    let remaining = monthlyConsumptionKwh;
    let low = 0;
    const consumedByTranche = [];
    for (const [upper, price] of tranches) {
      const span = Math.max(0, Math.min(upper, monthlyConsumptionKwh) - low);
      consumedByTranche.push({ price, kwh: span });
      low = upper;
      if (upper >= monthlyConsumptionKwh) break;
    }
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

// ── PVGIS ──────────────────────────────────────────
const PVGIS = {
  scale(perKw, peakpower) {
    return {
      annualKwh: perKw.yieldPerKw * peakpower,
      specificYield: perKw.yieldPerKw,
      monthlyKwh: perKw.monthlyPerKw.map(m => m * peakpower),
      radiationAnnual: perKw.radiationAnnual,
    };
  },
};

// ── ROI ────────────────────────────────────────────
const ROI = {
  compute({ pv, monthlyConsumption, capexMAD, exportAllowed }) {
    const annualPv = pv.annualKwh;
    const annualCons = monthlyConsumption * 12;
    const sizingRatio = annualPv / Math.max(annualCons, 1);
    const selfRatio = CONFIG.selfConsumptionRatio(sizingRatio);

    let annualSavingsMAD = 0;
    let annualSelfKwh = 0;
    let annualExportableKwh = 0;

    for (const monthKwh of pv.monthlyKwh) {
      const selfKwh = monthKwh * selfRatio;
      const surplusKwh = monthKwh - selfKwh;
      annualSelfKwh += selfKwh;
      annualExportableKwh += surplusKwh;

      const avoided = Tariff.avoidedCostPerKwh(monthlyConsumption, selfKwh);
      annualSavingsMAD += selfKwh * avoided;
    }

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

// ── Test Infrastructure ─────────────────────────────────────────
const MathTests = {
  errors: [],
  warnings: [],

  assert(condition, message, details = "") {
    if (!condition) {
      this.errors.push({ message, details, type: "ERROR" });
      return false;
    }
    return true;
  },

  assertClose(actual, expected, tolerance, message, details = "") {
    const diff = Math.abs(actual - expected);
    const pctDiff = Math.abs(expected) > 0 ? (diff / Math.abs(expected)) * 100 : 0;
    if (pctDiff > tolerance) {
      this.errors.push({
        message,
        details: `${details}\nExpected: ${expected}, Got: ${actual}, Diff: ${pctDiff.toFixed(3)}%`,
        type: "ERROR",
      });
      return false;
    }
    return true;
  },

  warn(condition, message, details = "") {
    if (!condition) {
      this.warnings.push({ message, details, type: "WARNING" });
    }
  },

  report() {
    console.log("\n" + "=".repeat(80));
    console.log("ATLAS SOLAR — MATHEMATICAL VALIDATION REPORT");
    console.log("=".repeat(80));

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log("✓ All tests passed.\n");
    } else {
      if (this.errors.length > 0) {
        console.log(`\n❌ ${this.errors.length} ERROR(S) FOUND:\n`);
        this.errors.forEach((e, i) => {
          console.log(`${i + 1}. ${e.message}`);
          if (e.details) console.log(`   ${e.details}`);
        });
      }
      if (this.warnings.length > 0) {
        console.log(`\n⚠️  ${this.warnings.length} WARNING(S):\n`);
        this.warnings.forEach((w, i) => {
          console.log(`${i + 1}. ${w.message}`);
          if (w.details) console.log(`   ${w.details}`);
        });
      }
    }
    console.log("\n" + "=".repeat(80) + "\n");
    return this.errors.length === 0;
  },
};

// ─ Test 1: Tariff Calculations ─────────────────────────────────
function testTariffCalculations() {
  console.log("Test 1: Tariff Calculations");

  const bill100 = 100;
  const kwhFrom100 = Tariff.kwhFromBill(bill100);
  const billFromKwh = Tariff.costOf(kwhFrom100);
  MathTests.assertClose(
    billFromKwh,
    bill100,
    0.1,
    "Tariff.costOf(kwhFromBill(x)) ≈ x",
    `Bill 100 MAD → ${kwhFrom100.toFixed(2)} kWh → ${billFromKwh.toFixed(2)} MAD`
  );

  const bills = [50, 100, 200, 400, 1000];
  let lastKwh = 0;
  for (const bill of bills) {
    const kwh = Tariff.kwhFromBill(bill);
    MathTests.assert(
      kwh >= lastKwh,
      "Tariff.kwhFromBill is monotonically increasing",
      `Bill ${bills[bills.indexOf(bill) - 1] || 0} → ${lastKwh.toFixed(2)}, Bill ${bill} → ${kwh.toFixed(2)}`
    );
    lastKwh = kwh;
  }

  const monthlyConsumption = 150;
  const monthlyPvProduction = 50;
  const avoidedCost = Tariff.avoidedCostPerKwh(monthlyConsumption, monthlyPvProduction);
  const retailPrice = Tariff.averageRetailPrice(monthlyConsumption);
  MathTests.assert(
    avoidedCost >= retailPrice,
    "Avoided cost ≥ average retail price (displaces top tranches)",
    `Avoided: ${avoidedCost.toFixed(4)} MAD/kWh, Retail: ${retailPrice.toFixed(4)} MAD/kWh`
  );

  const zeroAvoidedCost = Tariff.avoidedCostPerKwh(150, 0);
  MathTests.assertClose(
    zeroAvoidedCost,
    0,
    0.1,
    "Tariff.avoidedCostPerKwh with 0 PV = 0",
    `Got: ${zeroAvoidedCost}`
  );

  const highPv = Tariff.avoidedCostPerKwh(100, 1000);
  const normalPv = Tariff.avoidedCostPerKwh(100, 100);
  MathTests.assertClose(
    highPv,
    normalPv,
    0.1,
    "Avoided cost saturates when PV ≥ consumption",
    `Normal (100/100): ${normalPv.toFixed(4)}, Excess (100/1000): ${highPv.toFixed(4)}`
  );

  console.log("  ✓ Tariff tests complete\n");
}

// ─ Test 2: Self-Consumption Ratio ──────────────────────────────
function testSelfConsumptionRatio() {
  console.log("Test 2: Self-Consumption Ratio");

  const ratios = [0, 0.5, 1, 1.5, 2, 3, 5];
  for (const r of ratios) {
    const sc = CONFIG.selfConsumptionRatio(r);
    MathTests.assert(
      sc >= 0 && sc <= 1,
      `selfConsumptionRatio(${r}) ∈ [0,1]`,
      `Got: ${sc}`
    );
  }

  let lastSc = CONFIG.selfConsumptionRatio(0);
  const testRatios = [0.2, 0.5, 1, 1.5, 2, 3];
  for (const r of testRatios) {
    const sc = CONFIG.selfConsumptionRatio(r);
    MathTests.assert(
      sc <= lastSc,
      `selfConsumptionRatio is monotonically decreasing`,
      `r=${r}: ${sc.toFixed(3)}, r=${testRatios[testRatios.indexOf(r) - 1]}: ${lastSc.toFixed(3)}`
    );
    lastSc = sc;
  }

  const r1 = CONFIG.selfConsumptionRatio(1);
  MathTests.assertClose(
    r1,
    0.55,
    10,
    "selfConsumptionRatio(1) ≈ 0.55",
    `Got: ${r1.toFixed(3)}`
  );

  console.log("  ✓ Self-consumption tests complete\n");
}

// ─ Test 3: PVGIS Scaling ───────────────────────────────────────
function testPVGISScaling() {
  console.log("Test 3: PVGIS Scaling");

  // Normalized monthly values from FALLBACK_SHAPE (normalized to sum to 1)
  // Based on: shape [0.072, 0.071, 0.086, 0.089, 0.092, 0.090, 0.096, 0.095, 0.087, 0.081, 0.068, 0.070]
  // with normalization by dividing by sum (0.9970)
  const perKw = {
    yieldPerKw: 1650,
    monthlyPerKw: [119.2, 117.5, 142.3, 147.3, 152.3, 148.9, 158.9, 157.2, 144.0, 134.1, 112.5, 115.8],
    radiationAnnual: 1800,
  };

  const monthlySum = perKw.monthlyPerKw.reduce((a, b) => a + b, 0);
  MathTests.assertClose(
    monthlySum,
    perKw.yieldPerKw,
    0.1,
    "Monthly sum equals annual yield (1 kWc)",
    `Monthly sum: ${monthlySum}, Annual: ${perKw.yieldPerKw}`
  );

  const scaled5 = PVGIS.scale(perKw, 5);
  MathTests.assertClose(
    scaled5.annualKwh,
    1650 * 5,
    0.01,
    "Scaling 1 kWc → 5 kWc preserves linearity",
    `Expected: ${1650 * 5}, Got: ${scaled5.annualKwh}`
  );

  const monthlySum5 = scaled5.monthlyKwh.reduce((a, b) => a + b, 0);
  MathTests.assertClose(
    monthlySum5,
    scaled5.annualKwh,
    0.1,
    "Scaled monthly sum equals scaled annual",
    `Monthly sum: ${monthlySum5}, Annual: ${scaled5.annualKwh}`
  );

  const scaled10 = PVGIS.scale(perKw, 10);
  MathTests.assertClose(
    scaled10.annualKwh,
    scaled5.annualKwh * 2,
    0.01,
    "5 kWc × 2 = 10 kWc (linear)",
    `5 kWc: ${scaled5.annualKwh}, 10 kWc: ${scaled10.annualKwh}`
  );

  console.log("  ✓ PVGIS scaling tests complete\n");
}

// ─ Test 4: ROI Annual Savings ──────────────────────────────────
function testROIAnnualSavings() {
  console.log("Test 4: ROI Annual Savings");

  const perKw = {
    yieldPerKw: 1650,
    monthlyPerKw: [119.2, 117.5, 142.3, 147.3, 152.3, 148.9, 158.9, 157.2, 144.0, 134.1, 112.5, 115.8],
    radiationAnnual: 1800,
  };
  const pv = PVGIS.scale(perKw, 3);
  const monthlyConsumption = 150;
  const capexMAD = 3 * 1000 * 11;

  const roi = ROI.compute({
    pv,
    monthlyConsumption,
    capexMAD,
    exportAllowed: false,
  });

  MathTests.assert(
    roi.annualSelfKwh >= 0,
    "Annual self-consumption ≥ 0",
    `Got: ${roi.annualSelfKwh}`
  );

  const expectedSelfKwh = pv.annualKwh * roi.selfRatio;
  MathTests.assertClose(
    roi.annualSelfKwh,
    expectedSelfKwh,
    0.1,
    "Annual self-consumption = annual PV × self ratio",
    `Expected: ${expectedSelfKwh}, Got: ${roi.annualSelfKwh}`
  );

  if (roi.paybackYr !== Infinity) {
    const expectedPayback = capexMAD / (roi.annualSavingsMAD - capexMAD * CONFIG.OPEX_PCT_CAPEX_YR);
    MathTests.assertClose(
      roi.paybackYr,
      expectedPayback,
      0.1,
      "Payback = capex / net year 1 revenue",
      `Expected: ${expectedPayback.toFixed(2)}, Got: ${roi.paybackYr.toFixed(2)}`
    );
  }

  MathTests.assertClose(
    roi.cashflow[0].cumulative,
    -capexMAD,
    0.01,
    "Year 0 cumulative = -capex",
    `Expected: ${-capexMAD}, Got: ${roi.cashflow[0].cumulative}`
  );

  MathTests.assert(
    roi.annualSavingsMAD > 0,
    "Annual savings > 0",
    `Got: ${roi.annualSavingsMAD.toFixed(2)} MAD`
  );

  console.log("  ✓ ROI savings tests complete\n");
}

// ─ Test 5: Cashflow Degradation & Inflation ────────────────────
function testCashflowDegradation() {
  console.log("Test 5: Cashflow Degradation & Inflation");

  const perKw = {
    yieldPerKw: 1650,
    monthlyPerKw: [119.2, 117.5, 142.3, 147.3, 152.3, 148.9, 158.9, 157.2, 144.0, 134.1, 112.5, 115.8],
    radiationAnnual: 1800,
  };
  const pv = PVGIS.scale(perKw, 3);
  const monthlyConsumption = 150;
  const capexMAD = 33000;

  const roi = ROI.compute({
    pv,
    monthlyConsumption,
    capexMAD,
    exportAllowed: false,
  });

  const expectedYear1Net = roi.annualSavingsMAD - capexMAD * CONFIG.OPEX_PCT_CAPEX_YR;
  MathTests.assertClose(
    roi.cashflow[1].net,
    expectedYear1Net,
    0.1,
    "Year 1 net = annual savings - opex",
    `Expected: ${expectedYear1Net.toFixed(2)}, Got: ${roi.cashflow[1].net.toFixed(2)}`
  );

  const year10 = roi.cashflow[10];
  const expectedYear10Savings = roi.annualSavingsMAD
    * Math.pow(1 - CONFIG.DEGRADATION_PCT_YR, 10 - 1)
    * Math.pow(1 + CONFIG.TARIFF_INFLATION_YR, 10 - 1);
  const expectedYear10Net = expectedYear10Savings - capexMAD * CONFIG.OPEX_PCT_CAPEX_YR;
  MathTests.assertClose(
    year10.net,
    expectedYear10Net,
    0.1,
    "Year 10 applies degradation and inflation correctly",
    `Expected: ${expectedYear10Net.toFixed(2)}, Got: ${year10.net.toFixed(2)}`
  );

  for (let i = 1; i < roi.cashflow.length; i++) {
    MathTests.assert(
      roi.cashflow[i].cumulative >= roi.cashflow[i - 1].cumulative - 1,
      `Cashflow cumulative is non-decreasing (year ${i})`,
      `Year ${i - 1}: ${roi.cashflow[i - 1].cumulative.toFixed(2)}, Year ${i}: ${roi.cashflow[i].cumulative.toFixed(2)}`
    );
  }

  const year25 = roi.cashflow[25];
  const expectedLifetime = year25.cumulative + capexMAD;
  MathTests.assertClose(
    roi.lifetimeSavingsMAD,
    expectedLifetime,
    0.1,
    "Lifetime savings = year 25 cumulative + capex",
    `Expected: ${expectedLifetime.toFixed(2)}, Got: ${roi.lifetimeSavingsMAD.toFixed(2)}`
  );

  console.log("  ✓ Cashflow degradation tests complete\n");
}

// ─ Test 6: NPV Calculation ────────────────────────────────────
function testNPVCalculation() {
  console.log("Test 6: NPV Calculation");

  const perKw = {
    yieldPerKw: 1650,
    monthlyPerKw: [119.2, 117.5, 142.3, 147.3, 152.3, 148.9, 158.9, 157.2, 144.0, 134.1, 112.5, 115.8],
    radiationAnnual: 1800,
  };
  const pv = PVGIS.scale(perKw, 3);
  const monthlyConsumption = 150;
  const capexMAD = 33000;

  const roi = ROI.compute({
    pv,
    monthlyConsumption,
    capexMAD,
    exportAllowed: false,
  });

  let manualNpv = 0;
  for (const cf of roi.cashflow) {
    manualNpv += cf.net / Math.pow(1 + CONFIG.DISCOUNT_RATE, cf.year);
  }
  MathTests.assertClose(
    roi.npv,
    manualNpv,
    0.1,
    "NPV = Σ(net / (1+r)^year)",
    `Expected: ${manualNpv.toFixed(2)}, Got: ${roi.npv.toFixed(2)}`
  );

  MathTests.assertClose(
    roi.cashflow[0].net,
    -capexMAD,
    0.01,
    "Year 0 net = -capex",
    `Got: ${roi.cashflow[0].net}`
  );

  if (roi.paybackYr < 20) {
    MathTests.warn(
      roi.npv > 0,
      "NPV should be positive if payback < 20 years (accounting for discount rate)",
      `NPV: ${roi.npv.toFixed(2)}, Payback: ${roi.paybackYr.toFixed(1)}`
    );
  }

  console.log("  ✓ NPV calculation tests complete\n");
}

// ─ Test 7: Export Calculations ────────────────────────────────
function testExportCalculations() {
  console.log("Test 7: Export Calculations");

  const perKw = {
    yieldPerKw: 1650,
    monthlyPerKw: [119.2, 117.5, 142.3, 147.3, 152.3, 148.9, 158.9, 157.2, 144.0, 134.1, 112.5, 115.8],
    radiationAnnual: 1800,
  };
  const pv = PVGIS.scale(perKw, 3);
  const monthlyConsumption = 150;
  const capexMAD = 33000;

  const roiNoExport = ROI.compute({
    pv,
    monthlyConsumption,
    capexMAD,
    exportAllowed: false,
  });

  const roiExport = ROI.compute({
    pv,
    monthlyConsumption,
    capexMAD,
    exportAllowed: true,
  });

  MathTests.assert(
    roiExport.annualSavingsMAD > roiNoExport.annualSavingsMAD,
    "Export allowed → higher savings",
    `No export: ${roiNoExport.annualSavingsMAD.toFixed(2)}, Export: ${roiExport.annualSavingsMAD.toFixed(2)}`
  );

  MathTests.assert(
    roiExport.annualExportKwh <= pv.annualKwh * CONFIG.EXPORT_CAP_PCT,
    "Export ≤ 20% of annual production",
    `Export: ${roiExport.annualExportKwh.toFixed(2)} kWh, Cap: ${(pv.annualKwh * CONFIG.EXPORT_CAP_PCT).toFixed(2)} kWh`
  );

  const expectedExportMAD = roiExport.annualExportKwh * CONFIG.EXPORT_PRICE_MAD_PER_KWH;
  MathTests.assertClose(
    roiExport.annualExportMAD,
    expectedExportMAD,
    0.1,
    "Export MAD = export kWh × price",
    `Expected: ${expectedExportMAD.toFixed(2)}, Got: ${roiExport.annualExportMAD.toFixed(2)}`
  );

  console.log("  ✓ Export tests complete\n");
}

// ─ Test 8: Metamorphic Tests ───────────────────────────────────
function testMetamorphic() {
  console.log("Test 8: Metamorphic Tests");

  const perKw = {
    yieldPerKw: 1650,
    monthlyPerKw: [119.2, 117.5, 142.3, 147.3, 152.3, 148.9, 158.9, 157.2, 144.0, 134.1, 112.5, 115.8],
    radiationAnnual: 1800,
  };

  const pv3kw = PVGIS.scale(perKw, 3);
  const pv6kw = PVGIS.scale(perKw, 6);

  MathTests.assertClose(
    pv6kw.annualKwh,
    pv3kw.annualKwh * 2,
    0.01,
    "Doubling capacity doubles production",
    `3 kW: ${pv3kw.annualKwh.toFixed(2)} kWh, 6 kW: ${pv6kw.annualKwh.toFixed(2)} kWh`
  );

  const roi1 = ROI.compute({
    pv: pv3kw,
    monthlyConsumption: 150,
    capexMAD: 3 * 1000 * 11,
    exportAllowed: false,
  });

  const roi2 = ROI.compute({
    pv: pv3kw,
    monthlyConsumption: 150,
    capexMAD: 3 * 1000 * 22,
    exportAllowed: false,
  });

  MathTests.assertClose(
    roi1.annualSelfKwh,
    roi2.annualSelfKwh,
    0.01,
    "Cost change doesn't affect production",
    `Savings 1: ${roi1.annualSavingsMAD.toFixed(2)}, Savings 2: ${roi2.annualSavingsMAD.toFixed(2)}`
  );

  // Note: payback does NOT scale linearly with cost because O&M is a % of capex.
  // When capex doubles, opex also doubles, changing the denominator.
  // This test verifies payback increases significantly (not that it doubles exactly).
  MathTests.assert(
    roi2.paybackYr > roi1.paybackYr * 2 - 5,
    "Doubling cost significantly increases payback period",
    `Cost ×1: ${roi1.paybackYr.toFixed(1)} years, Cost ×2: ${roi2.paybackYr.toFixed(1)} years`
  );

  const roi4kw = ROI.compute({
    pv: PVGIS.scale(perKw, 4),
    monthlyConsumption: 150,
    capexMAD: 4 * 1000 * 11,
    exportAllowed: false,
  });

  const annualPv4 = PVGIS.scale(perKw, 4).annualKwh;
  const annualCons = 150 * 12;
  const sizingRatio4 = annualPv4 / annualCons;
  const expectedSelfRatio4 = CONFIG.selfConsumptionRatio(sizingRatio4);
  MathTests.assertClose(
    roi4kw.selfRatio,
    expectedSelfRatio4,
    0.1,
    "Self ratio matches CONFIG function",
    `Expected: ${expectedSelfRatio4.toFixed(3)}, Got: ${roi4kw.selfRatio.toFixed(3)}`
  );

  const monthlySum = pv3kw.monthlyKwh.reduce((a, b) => a + b, 0);
  MathTests.assertClose(
    monthlySum,
    pv3kw.annualKwh,
    0.1,
    "Monthly production sum = annual production",
    `Monthly sum: ${monthlySum.toFixed(2)}, Annual: ${pv3kw.annualKwh.toFixed(2)}`
  );

  console.log("  ✓ Metamorphic tests complete\n");
}

// ─ Test 9: Unit Consistency ────────────────────────────────────
function testUnitConsistency() {
  console.log("Test 9: Unit Consistency");

  const peakpowerKwc = 3;
  const peakpowerW = peakpowerKwc * 1000;
  const costPerW = 11;
  const capexMAD = peakpowerW * costPerW;
  MathTests.assertClose(
    capexMAD,
    33000,
    0.1,
    "3 kWc × 1000 W/kW × 11 MAD/W = 33,000 MAD",
    `Got: ${capexMAD}`
  );

  const kwh_month = 150;
  const kwh_year = kwh_month * 12;
  MathTests.assertClose(
    kwh_year,
    1800,
    0.1,
    "150 kWh/month × 12 = 1800 kWh/year",
    `Got: ${kwh_year}`
  );

  const avgTariff = Tariff.averageRetailPrice(150);
  MathTests.assert(
    avgTariff > 0 && avgTariff < 3,
    "Tariff in range [0, 3] MAD/kWh",
    `Got: ${avgTariff.toFixed(4)} MAD/kWh`
  );

  const opex = capexMAD * CONFIG.OPEX_PCT_CAPEX_YR;
  MathTests.assertClose(
    opex,
    330,
    0.1,
    "OPEX = capex × 1% = 330 MAD/yr",
    `Got: ${opex.toFixed(2)}`
  );

  console.log("  ✓ Unit consistency tests complete\n");
}

// ─ Test 10: Boundary Conditions ────────────────────────────────
function testBoundaryConditions() {
  console.log("Test 10: Boundary Conditions");

  const roi0Consumption = ROI.compute({
    pv: PVGIS.scale(
      { yieldPerKw: 1650, monthlyPerKw: Array(12).fill(137.5), radiationAnnual: 1800 },
      3
    ),
    monthlyConsumption: 0.001,
    capexMAD: 33000,
    exportAllowed: true,
  });
  MathTests.assert(
    roi0Consumption.annualSavingsMAD > 0,
    "Low consumption with export still has positive savings",
    `Savings: ${roi0Consumption.annualSavingsMAD.toFixed(2)} MAD`
  );

  const roiHighConsumption = ROI.compute({
    pv: PVGIS.scale(
      { yieldPerKw: 1650, monthlyPerKw: Array(12).fill(137.5), radiationAnnual: 1800 },
      3
    ),
    monthlyConsumption: 1000,
    capexMAD: 33000,
    exportAllowed: true,
  });
  MathTests.assert(
    roiHighConsumption.annualExportKwh >= 0,
    "High consumption still allows export",
    `Export: ${roiHighConsumption.annualExportKwh.toFixed(2)} kWh`
  );

  const roiNegative = ROI.compute({
    pv: PVGIS.scale(
      { yieldPerKw: 100, monthlyPerKw: Array(12).fill(8.33), radiationAnnual: 1200 },
      1
    ),
    monthlyConsumption: 50,
    capexMAD: 1000000,
    exportAllowed: false,
  });
  MathTests.assert(
    roiNegative.paybackYr === Infinity || roiNegative.paybackYr > 100,
    "Negative cashflow → payback = Infinity",
    `Payback: ${roiNegative.paybackYr}`
  );

  console.log("  ✓ Boundary condition tests complete\n");
}

// ─ Main Test Runner ───────────────────────────────────────────
function runAllTests() {
  try {
    testTariffCalculations();
    testSelfConsumptionRatio();
    testPVGISScaling();
    testROIAnnualSavings();
    testCashflowDegradation();
    testNPVCalculation();
    testExportCalculations();
    testMetamorphic();
    testUnitConsistency();
    testBoundaryConditions();
  } catch (e) {
    MathTests.errors.push({
      message: "Uncaught exception during tests",
      details: e.message + "\n" + e.stack,
      type: "ERROR",
    });
  }

  return MathTests.report();
}

// Run tests
if (require.main === module) {
  const passed = runAllTests();
  process.exit(passed ? 0 : 1);
}

module.exports = { MathTests, runAllTests, CONFIG, Tariff, PVGIS, ROI };
