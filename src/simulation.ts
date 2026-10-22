import type { CpfLifeTable } from './life-table';
import { Person } from './person';
import type { CpfParameters, PersonResult, PlanInput } from './types';
import type { RetirementSums } from './retirement-sums';

// The couple going through the model year by year. The passes over the two
// people stay in lockstep because the transfers compare both spouses'
// balances at the same point in the year.
export class Household {
  private readonly me: Person;
  private readonly wife: Person;

  constructor(
    private readonly params: CpfParameters,
    private readonly sums: RetirementSums,
    private readonly life: CpfLifeTable,
    private readonly input: PlanInput,
  ) {
    this.me = new Person(params, input.you, false);
    this.wife = new Person(params, input.wife, true);
  }

  // Someone already 55 or older today formed their RA in the past.
  formExistingRetirementAccounts(frsThisYear: number): void {
    this.me.formExistingRetirementAccount(this.params.baseYear, frsThisYear);
    this.wife.formExistingRetirementAccount(this.params.baseYear, frsThisYear);
  }

  // One calendar year, in three lockstep passes:
  // 1. Form RAs at 55 and apply the optional ERS top-up.
  // 2. Run the optional OA-to-SA strategy: own SA first for both, then each
  //    spouse gives their spare OA to the other.
  // 3. Lock in and pay CPF LIFE, spend leftover OA at retirement, and credit
  //    a year of interest.
  advanceOneYear(year: number, retirementYear: number): void {
    const { me, wife, input, life } = this;
    const sums = this.sums.yearly(year, input.rsGrowth);

    me.formRetirementAccountAt55(input, year, sums);
    wife.formRetirementAccountAt55(input, year, sums);
    me.topUpRetirementAccountToErs(input, year, sums);
    wife.topUpRetirementAccountToErs(input, year, sums);

    if (input.optOaToSaTopUp) {
      me.transferSpareOrdinaryToOwnSpecial(year, sums);
      wife.transferSpareOrdinaryToOwnSpecial(year, sums);
      me.giveSpareOrdinaryTo(wife, input, year, sums);
      wife.giveSpareOrdinaryTo(me, input, year, sums);
    }

    me.completeYear(input, life, year, retirementYear);
    wife.completeYear(input, life, year, retirementYear);
  }

  results(): [PersonResult, PersonResult] {
    return [this.me.result, this.wife.result];
  }
}
