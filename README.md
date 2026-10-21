# Our Retirement Number

A single-page calculator for a Singapore couple's retirement. With no new CPF contributions, it works out:

1. The cash needed at each person's 55 to top up the Retirement Account to the Enhanced Retirement Sum (optional strategy).
2. The savings needed at retirement to fund a target monthly income on top of CPF LIFE.

## Files

- `index.html`: the complete app (HTML, CSS and JavaScript in one file). Open it in any browser; no install or server needed. It loads fonts from Google Fonts when online and falls back to system fonts offline.
- `model.js`: the calculation model on its own (the same code that is embedded in `index.html`), for checking or reuse in Node.js:

  ```js
  const { plan } = require('./model.js');
  const r = plan({
    target: 6000, retireAge: 65, deathAge: 90, inflation: 0.025, rPost: 0.03, rsGrowth: 0.035,
    startAge: 65, plan: 'standard', countOA: true, optOA: false, ers: true,
    you:  { age: 45, oa: 120000, sa: 150000, ma: 70000 },
    wife: { age: 43, oa: 80000,  sa: 100000, ma: 60000 }
  });
  console.log(r.cash55Today, r.potToday, r.totalToday);
  ```

If you edit the model, change it in both `model.js` and the `<script>` block in `index.html`.

## Key assumptions

- CPF interest: OA 2.5%, SA/MA/RA 4%, plus extra interest (1% on the first $60,000 before 55; 2% on the first $30,000 and 1% on the next $30,000 from 55, with OA capped at $20,000).
- Retirement sums: FRS $220,400 (2026) and $228,200 (2027), then growing at the rate you set. BRS = FRS / 2, ERS = 2 × FRS.
- CPF LIFE payouts come from CPF Board's 2026 Standard Plan table (male, payout from 65). Women's payouts are 5% lower, deferral adds 6% a year, and the Escalating Plan starts about 22% lower and rises 2% a year.
- Spending stays the same after one spouse dies.

This is a planning estimate, not financial advice.
