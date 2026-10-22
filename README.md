# Our Retirement Number

A single-page calculator for a Singapore couple's retirement. With no new CPF contributions, it works out:

1. The cash needed at each person's 55 to top up the Retirement Account to the Enhanced Retirement Sum (optional strategy).
2. The savings needed at retirement to fund a target monthly income on top of CPF LIFE.

## Files

- `index.html`: the app UI. Open it in any browser; no install or server needed. It loads `data.js` and `model.js` from the same folder, and Google Fonts when online.
- `model.js`: the calculation model. Contains no figures; `createModel(cpfRules, cpfLife)` injects them. Also usable from Node:

  ```js
  const { createModel } = require('./model.js');
  const DATA = require('./data.js');
  const model = createModel(DATA.cpfRules, DATA.cpfLife);
  const result = model.plan({
    target: 6000, retireAge: 65, deathAge: 90, inflation: 0.025, rPost: 0.03, rsGrowth: 0.035,
    startAge: 65, plan: 'standard', countOA: true, optOA: false, ers: true,
    you:  { age: 45, oa: 120000, sa: 150000, ma: 70000 },
    wife: { age: 43, oa: 80000,  sa: 100000, ma: 60000 }
  });
  console.log(result.ersTopUpToday, result.savingsAtRetirementToday, result.totalToday);
  ```

- `data.js`: every yearly figure, annotated by section - example form values, statutory CPF parameters, and the CPF LIFE payout reference.
- `test.js`: golden parity test plus a syntax check of the page's script. Run with `node test.js`; CI runs it on every push.
- `update.md`: what to refresh each year and where.

## Updating figures

Edit `data.js`, run `node test.js`, commit. `update.md` has the yearly checklist.

## Key assumptions

- CPF interest and extra-interest tiers: `cpfRules.interest` and `cpfRules.extraInterest` in `data.js`.
- Retirement sums: `cpfRules.retirementSums` in `data.js` - announced FRS entries; years beyond them grow at the form's growth rate. BRS = FRS / 2, ERS = 2 x FRS.
- CPF LIFE payouts: `cpfLife` in `data.js` - Standard Plan table (male, payout from 65). Women's payouts are about 5% lower, deferral adds about 6% a year (derived from CPF's published payouts at 65 and 70), and the Escalating Plan starts lower and rises 2% a year.
- Spending stays the same after one spouse dies.

This is a planning estimate, not financial advice.
