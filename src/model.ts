import { CpfLifeTable } from './life-table';
import { RetirementSums } from './retirement-sums';
import { Household } from './simulation';
import { buildDrawdownRows, scheduleDrawdown, solveSavingsNeeded } from './drawdown';
import type {
  CpfLifeData,
  CpfParameters,
  CpfRulesData,
  ErsTopUp,
  PlanInput,
  PlanResult,
  PersonResult,
  RetirementSumKind,
} from './types';

export interface RetirementModel {
  plan(input: PlanInput): PlanResult;
  retirementSum(kind: RetirementSumKind, year: number, growthRate: number): number;
  payoutAtReferenceAge(raBalance: number): number;
  baseYear: number;
}

export function createModel(
  cpfRules: CpfRulesData,
  cpfLife: CpfLifeData,
  options: { baseYear?: number } = {},
): RetirementModel {
  const baseYear = options.baseYear ?? new Date().getFullYear();
  const params: CpfParameters = {
    baseYear,
    raFormationAge: cpfRules.ages.raFormationAge,
    lifeReferenceAge: cpfRules.ages.lifeReferenceAge,
    ordinaryGrowth: 1 + cpfRules.interest.ordinaryAccountPct / 100,
    specialGrowth: 1 + cpfRules.interest.specialAccountPct / 100,
    extraInterestOrdinaryCap: cpfRules.extraInterest.ordinaryAccountCap,
    extraInterestTiersBeforeRa: cpfRules.extraInterest.beforeRaFormation.map(tier => ({
      balance: tier.tierBalance,
      rate: tier.extraPct / 100,
    })),
    extraInterestTiersAfterRa: cpfRules.extraInterest.afterRaFormation.map(tier => ({
      balance: tier.tierBalance,
      rate: tier.extraPct / 100,
    })),
  };
  const sums = new RetirementSums(cpfRules.retirementSums);
  const life = new CpfLifeTable(cpfLife);

  // The whole model: simulate every year from now until the plan ends, then
  // work out the smallest savings pot that covers the retirement shortfalls.
  function plan(input: PlanInput): PlanResult {
    const retirementYear = baseYear + Math.max(0, input.retireAge - input.you.age);
    const yearEnding = baseYear + Math.max(input.deathAge - input.you.age, input.deathAge - input.wife.age); // exclusive
    const deflate = (year: number) => Math.pow(1 + input.inflation, year - baseYear);

    const household = new Household(params, sums, life, input);
    household.formExistingRetirementAccounts(sums.at('FRS', baseYear, input.rsGrowth));
    for (let year = baseYear; year < yearEnding; year++) {
      household.advanceOneYear(year, retirementYear);
    }

    const [you, wife] = household.results();
    const rows = buildDrawdownRows(you, wife, input, baseYear, retirementYear, yearEnding, deflate);
    const savingsAtRetirement = solveSavingsNeeded(rows, input.rPost);
    const drawdownRows = scheduleDrawdown(rows, savingsAtRetirement, input.rPost);

    const ersTopUp = (result: PersonResult): ErsTopUp => ({
      nominal: result.cashUsedForErsTopUp,
      todayDollars: result.yearAt55 ? result.cashUsedForErsTopUp / deflate(result.yearAt55) : 0,
      year: result.yearAt55,
    });
    const ersTopUpByPerson = [ersTopUp(you), ersTopUp(wife)];
    const ersTopUpToday = ersTopUpByPerson[0].todayDollars + ersTopUpByPerson[1].todayDollars;
    const savingsAtRetirementToday = savingsAtRetirement / deflate(retirementYear);

    return {
      retirementYear,
      yearEnding,
      savingsAtRetirement,
      savingsAtRetirementToday,
      ersTopUpByPerson,
      ersTopUpToday,
      totalToday: ersTopUpToday + savingsAtRetirementToday,
      you,
      wife,
      drawdownRows,
      deflate,
    };
  }

  return {
    plan,
    retirementSum: (kind, year, growthRate) => sums.at(kind, year, growthRate),
    payoutAtReferenceAge: raBalance => life.payoutAt(raBalance),
    baseYear,
  };
}
