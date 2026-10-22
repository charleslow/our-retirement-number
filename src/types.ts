// Shapes of the data.js sections the model consumes, and the model's
// input/output contract. Percent fields in data.js become fractions
// (0.025) by the time they reach PlanInput.

export interface CpfRulesData {
  ages: {
    raFormationAge: number;
    lifeReferenceAge: number;
  };
  retirementSums: {
    brsFractionOfFrs: number;
    ersMultipleOfFrs: number;
    announced: { year: number; frs: number }[];
  };
  interest: {
    ordinaryAccountPct: number;
    specialAccountPct: number;
  };
  extraInterest: {
    ordinaryAccountCap: number;
    beforeRaFormation: { tierBalance: number; extraPct: number }[];
    afterRaFormation: { tierBalance: number; extraPct: number }[];
  };
}

export interface CpfLifeData {
  table: {
    year: number;
    plan: string;
    points: { raBalance: number; monthlyPayout: number }[];
  };
  adjustments: {
    femaleDiscountPct: number;
    tableCalibrationFactor: number;
  };
  // Published Standard Plan payouts for the same member (same RA balance) at
  // two start ages; the model derives the per-year deferral uplift from the pair.
  deferralPayouts: { startAge: number; monthlyPayout: number }[];
  escalatingPlan: {
    standardFrsMonthly: number;
    escalatingFrsMonthly: number;
    annualIncreasePct: number;
  };
}

export type LifePlan = 'standard' | 'escalating';
export type RetirementSumKind = 'FRS' | 'BRS' | 'ERS';

// One CPF account balance, in dollars.
export interface PersonInput {
  age: number;
  oa: number;
  sa: number;
  ma: number;
}

export interface PlanInput {
  target: number; // combined monthly retirement income, today's dollars
  retireAge: number;
  deathAge: number;
  inflation: number;
  rPost: number;
  rsGrowth: number;
  startAge: number;
  plan: LifePlan;
  optOaToSaTopUp: boolean;
  optErsTopUp: boolean;
  countOA: boolean;
  you: PersonInput;
  wife: PersonInput;
}

// Fixed CPF parameters for one model instance, converted once from the
// percent fields in data.js to growth multipliers and rates.
export interface CpfParameters {
  baseYear: number;
  raFormationAge: number;
  lifeReferenceAge: number;
  ordinaryGrowth: number;
  specialGrowth: number;
  extraInterestOrdinaryCap: number;
  extraInterestTiersBeforeRa: ExtraInterestTier[];
  extraInterestTiersAfterRa: ExtraInterestTier[];
}

export interface ExtraInterestTier {
  balance: number;
  rate: number;
}

// One spouse's projected CPF outcome, in nominal dollars keyed by year.
export interface PersonResult {
  yearAt55: number | null;
  frsAt55: number | null;
  ersAt55: number | null;
  raAtFormation: number | null;
  oaTransferredToOwnSpecial: number;
  oaGivenToSpouse: number;
  oaReceivedFromSpouse: number;
  oaUsedForErsTopUp: number;
  cashUsedForErsTopUp: number;
  raAfterErsTopUp: number | null;
  raAtReferenceAge: number | null;
  yearAtReferenceAge: number;
  monthlyPayoutAtStart: number;
  payoutStartYear: number | null;
  oaSpentAtRetirement: number;
  oaSpentYear: number | null;
  payoutByYear: Record<number, number>;
}

// Cash needed at 55 to fill one person's RA to that year's ERS.
export interface ErsTopUp {
  nominal: number;
  todayDollars: number;
  year: number | null;
}

// One retirement year: income needed, where it comes from, and the
// shortfall that savings must cover.
export interface DrawdownRow {
  year: number;
  ageYou: number;
  ageWife: number;
  need: number;
  lifePayoutYou: number;
  lifePayoutWife: number;
  oaSpent: number;
  shortfall: number;
}

export interface ScheduledDrawdownRow extends DrawdownRow {
  startBalance: number;
  endBalance: number;
}

export interface PlanResult {
  retirementYear: number;
  yearEnding: number;
  savingsAtRetirement: number;
  savingsAtRetirementToday: number;
  ersTopUpByPerson: ErsTopUp[];
  ersTopUpToday: number;
  totalToday: number;
  you: PersonResult;
  wife: PersonResult;
  drawdownRows: ScheduledDrawdownRow[];
  deflate: (year: number) => number;
}
