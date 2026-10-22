import type { DrawdownRow, PersonResult, PlanInput, ScheduledDrawdownRow } from './types';

// Year-by-year retirement budget: income needed, CPF LIFE payouts, OA spent,
// and the shortfall that savings must cover.
export function buildDrawdownRows(
  you: PersonResult,
  wife: PersonResult,
  input: PlanInput,
  baseYear: number,
  retirementYear: number,
  yearEnding: number,
  deflate: (year: number) => number,
): DrawdownRow[] {
  const rows: DrawdownRow[] = [];
  for (let year = retirementYear; year < yearEnding; year++) {
    const need = input.target * 12 * deflate(year);
    const lifePayoutYou = you.payoutByYear[year] || 0;
    const lifePayoutWife = wife.payoutByYear[year] || 0;
    const oaSpent = (you.oaSpentYear === year ? you.oaSpentAtRetirement : 0)
      + (wife.oaSpentYear === year ? wife.oaSpentAtRetirement : 0);
    rows.push({
      year,
      ageYou: input.you.age + (year - baseYear),
      ageWife: input.wife.age + (year - baseYear),
      need,
      lifePayoutYou,
      lifePayoutWife,
      oaSpent,
      shortfall: need - lifePayoutYou - lifePayoutWife - oaSpent,
    });
  }
  return rows;
}

// Smallest pot at retirement that never runs below zero: walk the years
// backwards, discounting each year's shortfall to the previous year.
export function solveSavingsNeeded(rows: DrawdownRow[], postRetirementReturn: number): number {
  let savingsNeeded = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    savingsNeeded = Math.max(0, rows[i].shortfall + savingsNeeded / (1 + postRetirementReturn));
  }
  return rows.length ? savingsNeeded : 0;
}

// Walk the pot forward to show the running balance each year.
export function scheduleDrawdown(
  rows: DrawdownRow[],
  startingBalance: number,
  postRetirementReturn: number,
): ScheduledDrawdownRow[] {
  let balance = startingBalance;
  return rows.map(row => {
    const startBalance = balance;
    balance = Math.max(0, (balance - row.shortfall) * (1 + postRetirementReturn));
    return { ...row, startBalance, endBalance: balance };
  });
}
