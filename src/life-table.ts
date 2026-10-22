import type { CpfLifeData, LifePlan } from './types';

// CPF LIFE payout math: the published Standard Plan table at the reference
// age, plus the adjustments for sex, plan choice and deferral.
export class CpfLifeTable {
  private readonly points: { balance: number; payoutPerDollar: number }[];
  private readonly calibrationFactor: number;
  private readonly femalePayoutFactor: number;
  private readonly deferralUpliftPerYear: number;
  private readonly escalatingStartRatio: number;

  constructor(private readonly data: CpfLifeData) {
    // The table as payout-per-dollar of RA balance, so interpolation stays
    // proportional.
    this.points = data.table.points.map(point => ({
      balance: point.raBalance,
      payoutPerDollar: point.monthlyPayout / point.raBalance,
    }));
    this.calibrationFactor = data.adjustments.tableCalibrationFactor;
    this.femalePayoutFactor = 1 - data.adjustments.femaleDiscountPct / 100;
    // Per-year deferral uplift, derived from CPF's published payout pair across start ages.
    const firstDeferralPayout = data.deferralPayouts[0];
    const lastDeferralPayout = data.deferralPayouts[data.deferralPayouts.length - 1];
    this.deferralUpliftPerYear = Math.pow(
      lastDeferralPayout.monthlyPayout / firstDeferralPayout.monthlyPayout,
      1 / (lastDeferralPayout.startAge - firstDeferralPayout.startAge),
    );
    this.escalatingStartRatio = data.escalatingPlan.escalatingFrsMonthly
      / data.escalatingPlan.standardFrsMonthly;
  }

  // Escalating payouts rise by this factor every payout year.
  get escalatingYearlyGrowth(): number {
    return 1 + this.data.escalatingPlan.annualIncreasePct / 100;
  }

  // Monthly payout from the published table for an RA balance at the
  // reference age, interpolated between points (held flat beyond either end).
  payoutAt(raBalance: number): number {
    if (raBalance <= 0) return 0;
    return raBalance * this.interpolatedRate(raBalance);
  }

  // Monthly payout for one person at their payout start: table value, then
  // the calibration, sex, plan and deferral adjustments.
  payoutFor(raBalance: number, isFemale: boolean, plan: LifePlan, deferredYears: number): number {
    let payout = this.payoutAt(raBalance) * this.calibrationFactor
      * (isFemale ? this.femalePayoutFactor : 1);
    if (plan === 'escalating') payout *= this.escalatingStartRatio;
    return payout * Math.pow(this.deferralUpliftPerYear, deferredYears);
  }

  private interpolatedRate(raBalance: number): number {
    if (raBalance <= this.points[0].balance) return this.points[0].payoutPerDollar;
    for (let i = 0; i < this.points.length - 1; i++) {
      const lower = this.points[i];
      const upper = this.points[i + 1];
      if (raBalance >= lower.balance && raBalance <= upper.balance) {
        const weight = (raBalance - lower.balance) / (upper.balance - lower.balance);
        return lower.payoutPerDollar + weight * (upper.payoutPerDollar - lower.payoutPerDollar);
      }
    }
    return this.points[this.points.length - 1].payoutPerDollar;
  }
}
