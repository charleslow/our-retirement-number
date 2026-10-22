import type { CpfLifeTable } from './life-table';
import { tieredExtraInterest } from './interest';
import type { YearlySums } from './retirement-sums';
import type { CpfParameters, PersonInput, PersonResult, PlanInput } from './types';

// One spouse's CPF accounts and LIFE contract, advanced one calendar year at
// a time. The account balances are mutated only inside this class.
export class Person {
  private readonly isFemale: boolean;
  private readonly startingAge: number;
  private ordinary: number;
  private special: number;
  private medisave: number;
  private retirement = 0;
  private raFormed = false;
  private lifeLockedIn = false;
  readonly result: PersonResult;

  constructor(private readonly params: CpfParameters, input: PersonInput, isFemale: boolean) {
    this.isFemale = isFemale;
    this.startingAge = input.age;
    this.ordinary = input.oa;
    this.special = input.sa;
    this.medisave = input.ma;
    this.result = {
      yearAt55: null,
      frsAt55: null,
      ersAt55: null,
      raAtFormation: null,
      oaTransferredToOwnSpecial: 0,
      oaGivenToSpouse: 0,
      oaReceivedFromSpouse: 0,
      oaUsedForErsTopUp: 0,
      cashUsedForErsTopUp: 0,
      raAfterErsTopUp: null,
      raAtReferenceAge: null,
      yearAtReferenceAge: params.baseYear + params.lifeReferenceAge - input.age,
      monthlyPayoutAtStart: 0,
      payoutStartYear: null,
      oaSpentAtRetirement: 0,
      oaSpentYear: null,
      payoutByYear: {},
    };
  }

  ageAt(year: number): number {
    return this.startingAge + (year - this.params.baseYear);
  }

  // Already 55 or older today: the RA was formed in the past, from SA up front.
  formExistingRetirementAccount(year: number, frsThisYear: number): void {
    if (this.startingAge < this.params.raFormationAge) return;
    this.retirement = this.special;
    this.special = 0;
    this.raFormed = true;
    this.result.raAtFormation = this.retirement;
    this.result.yearAt55 = year;
    this.result.frsAt55 = frsThisYear;
  }

  // Pass 1 of the year: at 55, SA fills the RA up to that year's FRS, then OA
  // tops it up; SA above the FRS overflows into OA.
  formRetirementAccountAt55(input: PlanInput, year: number, sums: YearlySums): void {
    const age = this.ageAt(year);
    if (age >= input.deathAge || this.raFormed || age < this.params.raFormationAge) return;
    this.result.yearAt55 = year;
    this.result.frsAt55 = sums.full;
    const fromSpecial = Math.min(this.special, sums.full);
    this.retirement = fromSpecial;
    this.ordinary += this.special - fromSpecial;
    this.special = 0;
    const fromOrdinary = Math.min(this.ordinary, sums.full - this.retirement);
    this.retirement += fromOrdinary;
    this.ordinary -= fromOrdinary;
    this.raFormed = true;
    this.result.raAtFormation = this.retirement;
  }

  // Pass 1 of the year: under the strategy, the first 55 fills the RA to that
  // year's ERS, OA first, then cash.
  topUpRetirementAccountToErs(input: PlanInput, year: number, sums: YearlySums): void {
    const age = this.ageAt(year);
    if (age >= input.deathAge || !input.optErsTopUp || !this.raFormed
      || this.result.raAfterErsTopUp !== null || age >= this.params.lifeReferenceAge) return;
    this.result.ersAt55 = sums.enhanced;
    const topUpNeeded = Math.max(0, sums.enhanced - this.retirement);
    const fromOrdinary = Math.min(this.ordinary, topUpNeeded);
    this.ordinary -= fromOrdinary;
    this.result.oaUsedForErsTopUp = fromOrdinary;
    this.result.cashUsedForErsTopUp = topUpNeeded - fromOrdinary;
    this.retirement += topUpNeeded;
    this.result.raAfterErsTopUp = this.retirement;
  }

  // Pass 2, step one of the strategy: before 55, move spare OA into the own
  // SA, up to the FRS.
  transferSpareOrdinaryToOwnSpecial(year: number, sums: YearlySums): void {
    if (this.ageAt(year) >= this.params.raFormationAge) return;
    const transfer = Math.max(0, Math.min(this.ordinary, sums.full - this.special));
    this.ordinary -= transfer;
    this.special += transfer;
    this.result.oaTransferredToOwnSpecial += transfer;
  }

  // Pass 2, step two of the strategy: give spare OA to the spouse's SA while
  // they are still under 55, keeping at least the BRS in the giver's own name.
  giveSpareOrdinaryTo(spouse: Person, input: PlanInput, year: number, sums: YearlySums): void {
    const age = this.ageAt(year);
    if (spouse.ageAt(year) >= this.params.raFormationAge) return;
    if (this.ordinary <= 0 || age >= input.deathAge) return;
    const ownBalance = this.raFormed ? this.retirement : this.special;
    const giverKeepsBasic = Math.max(0, sums.basic - ownBalance);
    const transfer = Math.max(0, Math.min(this.ordinary - giverKeepsBasic, sums.full - spouse.special));
    if (transfer > 0) {
      this.ordinary -= transfer;
      spouse.special += transfer;
      this.result.oaGivenToSpouse += transfer;
      spouse.result.oaReceivedFromSpouse += transfer;
    }
  }

  // Pass 3 of the year: lock in and pay CPF LIFE, spend leftover OA at
  // retirement, and credit a year of interest. LIFE payouts continue after
  // death, to the household horizon; interest and the OA spend do not.
  completeYear(input: PlanInput, life: CpfLifeTable, year: number, retirementYear: number): void {
    const age = this.ageAt(year);
    const alive = age < input.deathAge;
    if (alive && age >= this.params.lifeReferenceAge && !this.lifeLockedIn) {
      this.lockInLifePayout(life, input);
    }
    this.recordYearlyPayout(age, input, year, life);
    if (!alive) return;
    this.spendLeftoverOrdinary(age, input, retirementYear, year);
    this.creditInterest();
  }

  // Lock in the CPF LIFE payout at the reference age: record the RA balance
  // and the monthly payout, adjusted for sex, plan choice and deferral.
  private lockInLifePayout(life: CpfLifeTable, input: PlanInput): void {
    this.lifeLockedIn = true;
    this.result.raAtReferenceAge = this.retirement;
    const deferredYears = Math.max(0, input.startAge - this.params.lifeReferenceAge);
    this.result.monthlyPayoutAtStart = life.payoutFor(this.retirement, this.isFemale, input.plan, deferredYears);
  }

  // Pay out the locked-in payout from the chosen start age, growing it every
  // year under the Escalating plan.
  private recordYearlyPayout(age: number, input: PlanInput, year: number, life: CpfLifeTable): void {
    if (age < input.startAge || !this.lifeLockedIn) return;
    if (this.result.payoutStartYear === null) this.result.payoutStartYear = year;
    let monthlyPayout = this.result.monthlyPayoutAtStart;
    if (input.plan === 'escalating') {
      monthlyPayout *= Math.pow(life.escalatingYearlyGrowth, year - this.result.payoutStartYear);
    }
    this.result.payoutByYear[year] = monthlyPayout * 12;
  }

  // At retirement, leftover OA becomes spendable cash (unless reserved for
  // the mortgage).
  private spendLeftoverOrdinary(age: number, input: PlanInput, retirementYear: number, year: number): void {
    if (!input.countOA || this.result.oaSpentYear !== null) return;
    if (age < this.params.raFormationAge || year < retirementYear) return;
    this.result.oaSpentAtRetirement = this.ordinary;
    this.result.oaSpentYear = year;
    this.ordinary = 0;
  }

  // Credit one year of interest. Extra interest on the capped OA balance is
  // earned by the OA but paid into the SA (or RA once formed). Once LIFE is
  // locked in the RA is gone, so only OA grows.
  private creditInterest(): void {
    const params = this.params;
    if (this.lifeLockedIn) {
      this.ordinary *= params.ordinaryGrowth;
      return;
    }
    const cappedOrdinary = Math.min(this.ordinary, params.extraInterestOrdinaryCap);
    if (!this.raFormed) {
      const [oaExtra, specialExtra, medisaveExtra] = tieredExtraInterest(
        [cappedOrdinary, this.special, this.medisave], params.extraInterestTiersBeforeRa);
      this.ordinary *= params.ordinaryGrowth;
      this.special = this.special * params.specialGrowth + oaExtra + specialExtra;
      this.medisave = this.medisave * params.specialGrowth + medisaveExtra;
    } else {
      const [raExtra, oaExtra, medisaveExtra] = tieredExtraInterest(
        [this.retirement, cappedOrdinary, this.medisave], params.extraInterestTiersAfterRa);
      this.retirement = this.retirement * params.specialGrowth + raExtra + oaExtra;
      this.ordinary *= params.ordinaryGrowth;
      this.medisave = this.medisave * params.specialGrowth + medisaveExtra;
    }
  }
}
