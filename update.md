# Updating the yearly figures

Every figure lives in `data.js`, annotated by section. Nothing is hardcoded in
`src/` or `index.html`.

## Workflow (every update)

1. Edit the relevant sections of `data.js`.
2. `npm test` - must pass. It pins the base year, so it behaves the same in any
   calendar year. If the new figures intentionally move results, refresh the golden
   numbers in `test.js` and call that out in the PR.
3. `npm run build:site`, then open `dist/index.html` in a browser and sanity-check
   the headline numbers.
4. One commit / PR with the `data.js` edit. CI runs the tests.

## It is 2030 - what to check

### cpfRules.retirementSums (check yearly)

- `announced`: add every newly announced FRS as `{ year: YYYY, frs: <amount> }`. Keep
  old entries. Years after the last announced entry grow at the form's
  "Retirement Sum growth" rate; BRS and ERS are derived from the FRS automatically,
  and the form label ("growth after ...") follows the last entry.
- `interest`, `extraInterest`: confirm against cpf.gov.sg; they rarely change.
- `ages`: statutory; assume unchanged.

Source: cpf.gov.sg - retirement sums page and interest rate pages.

### cpfLife (when CPF republishes the LIFE payout tables)

- `table.points`: replace with the current Standard Plan, male, payout-from-65 rows
  (RA balance and monthly payout).
- `escalatingPlan`: copy both FRS-balance payouts (Standard and Escalating) from the
  same publication; confirm `annualIncreasePct` (2).
- `adjustments`: confirm `femaleDiscountPct` (about 5). Re-derive `tableCalibrationFactor`
  if the published FRS payout no longer equals the interpolated table value times this factor.
- `deferralPayouts`: copy the published Standard Plan payout for the same member (same
  RA balance) at two start ages (65 and 70); the model derives the per-year uplift from
  the pair.
- If the table year changed, update `table.year` here and the "2026" mention in
  `README.md`.

Source: cpf.gov.sg - CPF LIFE payout table and the Retirement Payout Planner.

### defaults and defaultAgeNow (only if the examples should change)

- Form defaults, shown on first load. `defaultAgeNow` holds ages, not birth years, so
  they stay correct as years pass - no annual edit needed.

## Leave alone

- `src/` and `index.html` logic - touch only if a CPF rule itself changed, not just
  the values.
