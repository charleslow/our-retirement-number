# Our Retirement Number

A single-page calculator for a Singapore couple's retirement. With no new CPF contributions, it works out:

1. The cash needed at each person's 55 to top up the Retirement Account to the Enhanced Retirement Sum (optional strategy).
2. The savings needed at retirement to fund a target monthly income on top of CPF LIFE.

## Files

- `index.html`: the app UI. It loads `data.js` and the compiled `model.js` from the same folder, and Google Fonts when online. Serve the built `dist/` folder (see Development).
- `src/`: the calculation model, in TypeScript. Contains no figures; `createModel(cpfRules, cpfLife)` injects them:
  - `types.ts` - data shapes and the input/output contract
  - `retirement-sums.ts` - FRS/BRS/ERS for any year (`RetirementSums`)
  - `life-table.ts` - CPF LIFE payout table and adjustments (`CpfLifeTable`)
  - `interest.ts` - tiered extra-interest allocation
  - `person.ts` - one spouse's accounts and LIFE contract (`Person`)
  - `simulation.ts` - the couple advancing year by year in lockstep (`Household`)
  - `drawdown.ts` - the retirement-year budget and the savings solve
  - `model.ts` - `createModel`, tying it all together
- `data.js`: every yearly figure, annotated by section - example form values, statutory CPF parameters, and the CPF LIFE payout reference.
- `test.js`: golden parity test, a browser-bundle check, and a syntax check of the page's script. Run with `npm test`; CI runs it on every push.
- `update.md`: what to refresh each year and where.

## Development

Requires Node 22+.

```
npm install
npm test              # typecheck, build, run the golden tests
npm run build:site    # compile the site into dist/
```

`dist/index.html` is the built site - open it in any browser. The model compiles twice from the same source: `dist/model.js` (browser, exposed as the global `RetirementModel`) and `build/model.cjs` (Node, used by the tests). Both are gitignored build output.

Using the model from Node after a build:

```js
const { createModel } = require('./build/model.cjs');
const DATA = require('./data.js');
const model = createModel(DATA.cpfRules, DATA.cpfLife);
const result = model.plan({
  target: 6000, retireAge: 65, deathAge: 90, inflation: 0.025, rPost: 0.03, rsGrowth: 0.035,
  startAge: 65, plan: 'standard', countOA: true, optOaToSaTopUp: false, optErsTopUp: true,
  you:  { age: 45, oa: 120000, sa: 150000, ma: 70000 },
  wife: { age: 43, oa: 80000,  sa: 100000, ma: 60000 }
});
console.log(result.ersTopUpToday, result.savingsAtRetirementToday, result.totalToday);
```

## Deploy

Pushes to `main` build the site and publish `dist/` to GitHub Pages via `.github/workflows/deploy.yml`. GitHub Pages must be set to "GitHub Actions" as its source (Settings → Pages).

## Updating figures

Edit `data.js`, run `npm test`, commit. `update.md` has the yearly checklist.

## Key assumptions

- CPF interest and extra-interest tiers: `cpfRules.interest` and `cpfRules.extraInterest` in `data.js`.
- Retirement sums: `cpfRules.retirementSums` in `data.js` - announced FRS entries; years beyond them grow at the form's growth rate. BRS = FRS / 2, ERS = 2 x FRS.
- CPF LIFE payouts: `cpfLife` in `data.js` - Standard Plan table (male, payout from 65). Women's payouts are about 5% lower, deferral adds about 6% a year (derived from CPF's published payouts at 65 and 70), and the Escalating Plan starts lower and rises 2% a year.
- Spending stays the same after one spouse dies.

This is a planning estimate, not financial advice.
