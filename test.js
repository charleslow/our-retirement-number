// Golden parity test: pins baseYear so it passes in any calendar year.
// Run: npm test (builds first, then runs this file).
// If a figure change (update.md) intentionally moves these numbers, refresh the
// golden values below and say so in the PR.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const DATA = require('./data.js');

// The model runs from the built bundles, so build before testing.
function loadBuilt(file) {
  if (!fs.existsSync(path.join(__dirname, file))) {
    console.error('Missing ' + file + ' - build first: npm run build');
    process.exit(1);
  }
  return require('./' + file);
}
const { createModel } = loadBuilt('build/model.cjs');

const model = createModel(DATA.cpfRules, DATA.cpfLife, { baseYear: 2026 });

const baseInput = {
  target: 6000, retireAge: 65, deathAge: 90, inflation: 0.025, rPost: 0.03, rsGrowth: 0.035,
  startAge: 65, plan: 'standard', countOA: true, optOaToSaTopUp: false, optErsTopUp: true,
  you: { age: 45, oa: 120000, sa: 150000, ma: 70000 },
  wife: { age: 43, oa: 80000, sa: 100000, ma: 60000 },
};

const round2 = value => Math.round(value * 100) / 100;

// Map the result shape onto the golden values captured from the pre-refactor model.
function summarise(result) {
  const pickRow = row => ({
    y: row.year, ageYou: row.ageYou, ageWife: row.ageWife, need: round2(row.need),
    cYou: round2(row.lifePayoutYou), cWife: round2(row.lifePayoutWife), oaIn: round2(row.oaSpent),
    gap: round2(row.shortfall), start: round2(row.startBalance), end: round2(row.endBalance),
  });
  return {
    yRet: result.retirementYear,
    yEnd: result.yearEnding,
    pot: round2(result.savingsAtRetirement),
    potToday: round2(result.savingsAtRetirementToday),
    cash55Today: round2(result.ersTopUpToday),
    totalToday: round2(result.totalToday),
    cash55: result.ersTopUpByPerson.map(topUp => ({
      nominal: round2(topUp.nominal), today: round2(topUp.todayDollars), y: topUp.year,
    })),
    you: {
      ra65: round2(result.you.raAtReferenceAge),
      monthlyStart: round2(result.you.monthlyPayoutAtStart),
      cashTopUp: round2(result.you.cashUsedForErsTopUp),
      oaToOwnSA: round2(result.you.oaTransferredToOwnSpecial),
      oaLump: round2(result.you.oaSpentAtRetirement),
    },
    wife: {
      ra65: round2(result.wife.raAtReferenceAge),
      monthlyStart: round2(result.wife.monthlyPayoutAtStart),
      cashTopUp: round2(result.wife.cashUsedForErsTopUp),
    },
    firstRow: pickRow(result.drawdownRows[0]),
    lastRow: pickRow(result.drawdownRows[result.drawdownRows.length - 1]),
    rowCount: result.drawdownRows.length,
  };
}

// Golden values captured from the model on main, which includes the household-horizon
// LIFE payout fix (payouts run to the end of the plan for both spouses).
const golden = {
  base: {
    yRet: 2046, yEnd: 2073, pot: 901515.46, potToday: 550168.69, cash55Today: 476548.35,
    totalToday: 1026717.04,
    cash55: [{ nominal: 239175.9, today: 186843.83, y: 2036 }, { nominal: 389620.37, today: 289704.52, y: 2038 }],
    you: { ra65: 931556.45, monthlyStart: 4830.74, cashTopUp: 239175.9, oaToOwnSA: 0, oaLump: 0 },
    wife: { ra65: 997136.94, monthlyStart: 4912.28, cashTopUp: 389620.37 },
    firstRow: { y: 2046, ageYou: 65, ageWife: 63, need: 117980.38, cYou: 57968.86, cWife: 0, oaIn: 0, gap: 60011.52, start: 901515.46, end: 866749.06 },
    lastRow: { y: 2072, ageYou: 91, ageWife: 89, need: 224197.26, cYou: 57968.86, cWife: 58947.31, oaIn: 0, gap: 107281.09, start: 107281.09, end: 0 },
    rowCount: 27,
  },
  escalating: {
    pot: 960034.9, potToday: 585881.41, totalToday: 1062429.75,
    you: { monthlyStart: 3745.18 }, wife: { monthlyStart: 3808.39 },
  },
  optOaToSaTopUp: {
    cash55Today: 442609.28, totalToday: 992777.96,
    cash55: [{ nominal: 276800.07, today: 216235.77, y: 2036 }, { nominal: 304447.19, today: 226373.5, y: 2038 }],
    you: { cashTopUp: 276800.07, oaToOwnSA: 70400 },
    wife: { cashTopUp: 304447.19 },
  },
  deferredTo70: {
    pot: 911020.86, potToday: 555969.56, totalToday: 1032517.9,
    you: { monthlyStart: 6464.62 }, wife: { monthlyStart: 6573.73 },
    firstRow: { cYou: 0, cWife: 0, gap: 117980.38 },
  },
  retirementSums: { frs2026: 220400, frs2027: 228200, frs2030: 253009.42, brs2026: 110200, ers2026: 440800 },
  payouts: [490, 950, 1106.63, 1250, 1780, 2380, 3440, 4233.19],
};

let failures = 0;
function check(name, actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    console.log('ok - ' + name);
  } catch (error) {
    failures++;
    console.error('FAIL - ' + name + '\n' + error.message);
  }
}

const standard = summarise(model.plan(baseInput));
check('base scenario', standard, golden.base);

// The browser bundle must expose the same model via window.RetirementModel and
// produce the same numbers as the Node build.
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'dist/model.js'), 'utf8'), sandbox);
const browserGlobal = sandbox.window.RetirementModel || sandbox.RetirementModel;
const browserModel = browserGlobal.createModel(DATA.cpfRules, DATA.cpfLife, { baseYear: 2026 });
check('browser bundle parity', round2(browserModel.plan(baseInput).savingsAtRetirement), golden.base.pot);

const escalating = summarise(model.plan({ ...baseInput, plan: 'escalating' }));
check('escalating scenario', {
  pot: escalating.pot, potToday: escalating.potToday, totalToday: escalating.totalToday,
  you: { monthlyStart: escalating.you.monthlyStart }, wife: { monthlyStart: escalating.wife.monthlyStart },
}, golden.escalating);

const optOaToSaTopUp = summarise(model.plan({ ...baseInput, optOaToSaTopUp: true }));
check('optOaToSaTopUp scenario', {
  cash55Today: optOaToSaTopUp.cash55Today, totalToday: optOaToSaTopUp.totalToday, cash55: optOaToSaTopUp.cash55,
  you: { cashTopUp: optOaToSaTopUp.you.cashTopUp, oaToOwnSA: optOaToSaTopUp.you.oaToOwnSA },
  wife: { cashTopUp: optOaToSaTopUp.wife.cashTopUp },
}, golden.optOaToSaTopUp);

const deferredTo70 = summarise(model.plan({ ...baseInput, startAge: 70 }));
check('deferred-to-70 scenario', {
  pot: deferredTo70.pot, potToday: deferredTo70.potToday, totalToday: deferredTo70.totalToday,
  you: { monthlyStart: deferredTo70.you.monthlyStart }, wife: { monthlyStart: deferredTo70.wife.monthlyStart },
  firstRow: { cYou: deferredTo70.firstRow.cYou, cWife: deferredTo70.firstRow.cWife, gap: deferredTo70.firstRow.gap },
}, golden.deferredTo70);

check('retirement sums', {
  frs2026: round2(model.retirementSum('FRS', 2026, 0.035)),
  frs2027: round2(model.retirementSum('FRS', 2027, 0.035)),
  frs2030: round2(model.retirementSum('FRS', 2030, 0.035)),
  brs2026: round2(model.retirementSum('BRS', 2026, 0.035)),
  ers2026: round2(model.retirementSum('ERS', 2026, 0.035)),
}, golden.retirementSums);

check('LIFE payout table points and interpolation',
  [82400, 170100, 200000, 227900, 330100, 445600, 650100, 800000]
    .map(balance => round2(model.payoutAtReferenceAge(balance))),
  golden.payouts);

check('data.js wiring', {
  lifeTableRows: DATA.cpfLife.table.points.length,
  announcedSums: DATA.cpfRules.retirementSums.announced.length,
  defaultTarget: DATA.defaults.target,
  defaultAgeNow: DATA.defaultAgeNow,
}, { lifeTableRows: 6, announcedSums: 2, defaultTarget: 6000, defaultAgeNow: { me: 45, wife: 43 } });

// Compile (not run) the page's inline script to catch syntax errors; CI has no browser.
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const scriptBlocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
let compileError = null;
try {
  new vm.Script(scriptBlocks[scriptBlocks.length - 1], { filename: 'index.html (inline script)' });
} catch (error) {
  compileError = error.message;
}
check('index.html inline script compiles', compileError, null);

if (failures > 0) {
  console.error(failures + ' check(s) failed');
  process.exit(1);
}
console.log('All checks passed.');
