// Every yearly figure in the app lives in this file. Nothing is hardcoded in
// src/ or index.html. See update.md for the yearly refresh checklist.
// After any edit, run: npm test
'use strict';

const DATA = {

  // ---- Example form values ------------------------------------------------
  // Shown on first load; a user's own edits are saved in their browser.
  // "y-" ids are me, "w-" ids are the wife. oa/sa/ma = Ordinary/Special/MediSave.
  defaults: {
    target: 6000,       // combined monthly retirement income, in today's dollars
    retireAge: 65,
    deathAge: 90,
    inflation: 2.5,     // percent per year
    rPost: 3,           // percent per year, return on savings while retired
    'y-oa': 120000,
    'y-sa': 150000,
    'y-ma': 70000,
    'w-oa': 80000,
    'w-sa': 100000,
    'w-ma': 60000,
    plan: 'standard',   // standard | escalating
    optOaToSaTopUp: false, // move spare OA into SA each year
    optErsTopUp: true,  // top the RA up to the ERS at 55
    startAge: 65,       // CPF LIFE payouts start age, 65 to 70
    rsGrowth: 3.5,      // percent per year: FRS growth after the last announced year
    countOA: true,      // spend leftover OA in retirement
  },

  // Example ages, not birth years: birth years are computed at runtime, so these
  // stay correct as the years pass.
  defaultAgeNow: { me: 45, wife: 43 },

  // ---- Statutory CPF parameters -------------------------------------------
  cpfRules: {
    ages: {
      raFormationAge: 55,   // RA is formed; also the "until 55" of OA-to-SA transfers
      lifeReferenceAge: 65, // reference age of the CPF LIFE payout tables
    },

    retirementSums: {
      brsFractionOfFrs: 0.5, // Basic Retirement Sum = FRS x this
      ersMultipleOfFrs: 2,   // Enhanced Retirement Sum = FRS x this
      // Announced Full Retirement Sum, in nominal dollars. Add one entry per newly
      // announced year (source: cpf.gov.sg retirement sums page); keep old entries.
      // Years after the last entry grow at the form's "Retirement Sum growth" rate.
      announced: [
        { year: 2026, frs: 220400 },
        { year: 2027, frs: 228200 },
      ],
    },

    interest: {
      ordinaryAccountPct: 2.5,
      specialAccountPct: 4.0, // SA, RA and MA earn the same rate
    },

    extraInterest: {
      ordinaryAccountCap: 20000, // OA earns extra interest on at most this balance
      // Tiers are filled in order across the accounts (the model passes OA, SA, MA
      // before the RA is formed, and RA, OA, MA afterwards).
      beforeRaFormation: [
        { tierBalance: 60000, extraPct: 1.0 },
      ],
      afterRaFormation: [
        { tierBalance: 30000, extraPct: 2.0 },
        { tierBalance: 30000, extraPct: 1.0 },
      ],
    },
  },

  // ---- CPF LIFE payout reference (CPF Board table published 2026) ----------
  // When CPF republishes the table, replace this whole section - see update.md.
  cpfLife: {
    table: {
      year: 2026,
      plan: 'standard', // Standard Plan, male, payout from lifeReferenceAge
      // Monthly payout for a given RA balance at the reference age; the model
      // interpolates linearly between rows (source: cpf.gov.sg LIFE payout table).
      points: [
        { raBalance: 82400, monthlyPayout: 490 },
        { raBalance: 170100, monthlyPayout: 950 },
        { raBalance: 227900, monthlyPayout: 1250 },
        { raBalance: 330100, monthlyPayout: 1780 },
        { raBalance: 445600, monthlyPayout: 2380 },
        { raBalance: 650100, monthlyPayout: 3440 },
      ],
    },

    adjustments: {
      femaleDiscountPct: 5, // women's payouts are about this much lower
      // Aligns the interpolated table with CPF's published FRS/ERS payout examples.
      tableCalibrationFactor: 0.98,
    },

    // Deferral uplift: CPF's published Standard Plan payouts for the same member
    // (same RA balance) at two start ages. The model derives the per-year uplift
    // from this pair (source: cpf.gov.sg LIFE payout table).
    deferralPayouts: [
      { startAge: 65, monthlyPayout: 1780 },
      { startAge: 70, monthlyPayout: 2380 },
    ],

    escalatingPlan: {
      // From the same publication, at the FRS balance.
      standardFrsMonthly: 1780,
      escalatingFrsMonthly: 1380,
      annualIncreasePct: 2, // Escalating payouts then rise this percent a year
    },
  },
};

if (typeof module !== 'undefined') module.exports = DATA;
