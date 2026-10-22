import type { CpfRulesData, RetirementSumKind } from './types';

export interface YearlySums {
  full: number;
  basic: number;
  enhanced: number;
}

// FRS, BRS and ERS for any year: the last announced FRS at or before the
// year applies exactly; later years grow from it at the given rate.
export class RetirementSums {
  constructor(private readonly data: CpfRulesData['retirementSums']) {}

  at(kind: RetirementSumKind, year: number, growthRate: number): number {
    const full = this.fullRetirementSum(year, growthRate);
    switch (kind) {
      case 'BRS': return full * this.data.brsFractionOfFrs;
      case 'ERS': return full * this.data.ersMultipleOfFrs;
      case 'FRS': return full;
    }
  }

  yearly(year: number, growthRate: number): YearlySums {
    return {
      full: this.at('FRS', year, growthRate),
      basic: this.at('BRS', year, growthRate),
      enhanced: this.at('ERS', year, growthRate),
    };
  }

  private fullRetirementSum(year: number, growthRate: number): number {
    let governing = this.data.announced[0];
    for (const row of this.data.announced) if (row.year <= year) governing = row;
    return governing.frs * Math.pow(1 + growthRate, year - governing.year);
  }
}
