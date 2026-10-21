// Household retirement demand model (Singapore / CPF). Annual steps, nominal dollars.
// Every statutory figure comes from the cpf data files (see data/ and update.md);
// this file contains only rules and arithmetic.
'use strict';

// createModel(cpfRules, cpfLife, { baseYear }) -> { plan, retirementSum, payoutAtReferenceAge }
// cpfRules: parsed data/cpf_rules.yaml. cpfLife: parsed data/cpf_life_<year>.yaml.
// baseYear: override for testing; defaults to the current calendar year.
function createModel(cpfRules, cpfLife, options) {
  const baseYear = (options && options.baseYear) || new Date().getFullYear();

  const raFormationAge = cpfRules.ages.ra_formation_age;
  const lifeReferenceAge = cpfRules.ages.life_reference_age;
  const ordinaryGrowth = 1 + cpfRules.interest.ordinary_account_pct / 100;
  const specialGrowth = 1 + cpfRules.interest.special_account_pct / 100;
  const extraInterestOrdinaryCap = cpfRules.extra_interest.ordinary_account_cap;
  const extraInterestTiersBeforeRa = cpfRules.extra_interest.before_ra_formation
    .map(tier => [tier.tier_balance, tier.extra_pct / 100]);
  const extraInterestTiersAfterRa = cpfRules.extra_interest.after_ra_formation
    .map(tier => [tier.tier_balance, tier.extra_pct / 100]);
  const lifeTablePoints = cpfLife.table.points.map(point => [point.ra_balance, point.monthly_payout]);
  const femalePayoutFactor = 1 - cpfLife.adjustments.female_discount_pct / 100;
  const deferralFactorPerYear = 1 + cpfLife.adjustments.deferral_uplift_pct_per_year / 100;
  const tableCalibrationFactor = cpfLife.adjustments.table_calibration_factor;
  const escalatingStartRatio = cpfLife.escalating_plan.escalating_frs_monthly
    / cpfLife.escalating_plan.standard_frs_monthly;
  const escalatingGrowthPerYear = 1 + cpfLife.escalating_plan.annual_increase_pct / 100;

  // Retirement sums: the last announced FRS at or before the year applies exactly;
  // later years grow from it at the given rate. BRS = FRS x fraction, ERS = FRS x multiple.
  function retirementSum(kind, year, growthRate) {
    const announcedRows = cpfRules.retirement_sums.announced;
    let governingRow = announcedRows[0];
    for (const row of announcedRows) if (row.year <= year) governingRow = row;
    const fullSum = governingRow.frs * Math.pow(1 + growthRate, year - governingRow.year);
    if (kind === 'BRS') return fullSum * cpfRules.retirement_sums.brs_fraction_of_frs;
    if (kind === 'ERS') return fullSum * cpfRules.retirement_sums.ers_multiple_of_frs;
    return fullSum;
  }

  function yearlyRetirementSums(year, growthRate) {
    return {
      full: retirementSum('FRS', year, growthRate),
      basic: retirementSum('BRS', year, growthRate),
      enhanced: retirementSum('ERS', year, growthRate),
    };
  }

  // CPF LIFE Standard Plan monthly payout for an RA balance at the reference age,
  // interpolated between the published table points. The table is expressed as
  // payout-per-dollar of RA balance so interpolation stays proportional.
  function payoutAtReferenceAge(raBalance) {
    if (raBalance <= 0) return 0;
    const points = lifeTablePoints.map(([balance, payout]) => [balance, payout / balance]);
    let payoutPerDollar = points[points.length - 1][1];
    if (raBalance <= points[0][0]) {
      payoutPerDollar = points[0][1];
    } else {
      for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex++) {
        const [lowerBalance, lowerRate] = points[segmentIndex];
        const [upperBalance, upperRate] = points[segmentIndex + 1];
        if (raBalance >= lowerBalance && raBalance <= upperBalance) {
          const weight = (raBalance - lowerBalance) / (upperBalance - lowerBalance);
          payoutPerDollar = lowerRate + weight * (upperRate - lowerRate);
          break;
        }
      }
    }
    return raBalance * payoutPerDollar;
  }

  // Extra interest across accounts in priority order, filling each tier before the next.
  // Returns the extra interest earned by each account.
  function tieredExtraInterest(accountBalances, tiers) {
    const extraByAccount = accountBalances.map(() => 0);
    let tierIndex = 0;
    let tierRemaining = tiers[0][0];
    for (let accountIndex = 0; accountIndex < accountBalances.length; accountIndex++) {
      let balanceToAllocate = accountBalances[accountIndex];
      while (balanceToAllocate > 0 && tierIndex < tiers.length) {
        const amountInTier = Math.min(balanceToAllocate, tierRemaining);
        extraByAccount[accountIndex] += amountInTier * tiers[tierIndex][1];
        balanceToAllocate -= amountInTier;
        tierRemaining -= amountInTier;
        if (tierRemaining <= 0) {
          tierIndex++;
          if (tierIndex < tiers.length) tierRemaining = tiers[tierIndex][0];
        }
      }
    }
    return extraByAccount;
  }

  function createPerson(personInput, isFemale) {
    return {
      isFemale,
      startingAge: personInput.age,
      ordinary: personInput.oa,
      special: personInput.sa,
      medisave: personInput.ma,
      retirement: 0,
      raFormed: false,
      lifeLockedIn: false,
      result: {
        yearAt55: null, frsAt55: null, ersAt55: null, raAtFormation: null,
        oaTransferredToOwnSpecial: 0, oaGivenToSpouse: 0, oaReceivedFromSpouse: 0,
        oaUsedForErsTopUp: 0, cashUsedForErsTopUp: 0, raAfterErsTopUp: null,
        raAtReferenceAge: null, yearAtReferenceAge: baseYear + lifeReferenceAge - personInput.age,
        monthlyPayoutAtStart: 0, payoutStartYear: null,
        oaSpentAtRetirement: 0, oaSpentYear: null,
        payoutByYear: {},
      },
    };
  }

  // Someone already 55 or older today has their RA formed from SA up front.
  function formExistingRetirementAccounts(people, growthRate) {
    for (const person of people) {
      if (person.startingAge < raFormationAge) continue;
      person.retirement = person.special;
      person.special = 0;
      person.raFormed = true;
      Object.assign(person.result, {
        raAtFormation: person.retirement,
        yearAt55: baseYear,
        frsAt55: retirementSum('FRS', baseYear, growthRate),
      });
    }
  }

  // At 55: SA fills the RA up to that year's FRS, then OA tops it up; SA above the FRS
  // overflows into OA.
  function formRetirementAccountAt55(person, yearSums) {
    const fromSpecial = Math.min(person.special, yearSums.full);
    person.retirement = fromSpecial;
    person.ordinary += person.special - fromSpecial;
    person.special = 0;
    const fromOrdinary = Math.min(person.ordinary, yearSums.full - person.retirement);
    person.retirement += fromOrdinary;
    person.ordinary -= fromOrdinary;
    person.raFormed = true;
    person.result.raAtFormation = person.retirement;
  }

  // Optional strategy: at each 55, fill the RA to that year's ERS, OA first, then cash.
  function topUpRetirementAccountToErs(person, yearSums) {
    person.result.ersAt55 = yearSums.enhanced;
    const topUpNeeded = Math.max(0, yearSums.enhanced - person.retirement);
    const fromOrdinary = Math.min(person.ordinary, topUpNeeded);
    person.ordinary -= fromOrdinary;
    person.result.oaUsedForErsTopUp = fromOrdinary;
    person.result.cashUsedForErsTopUp = topUpNeeded - fromOrdinary;
    person.retirement += topUpNeeded;
    person.result.raAfterErsTopUp = person.retirement;
  }

  // Optional strategy: each year before 55, move spare OA into the person's own SA up to
  // the FRS, then into the spouse's SA. The giver always keeps at least the BRS.
  function transferSpareOrdinaryToSpecial(people, ages, yearSums, deathAge) {
    people.forEach((person, personIndex) => {
      if (ages[personIndex] >= raFormationAge) return;
      const transfer = Math.max(0, Math.min(person.ordinary, yearSums.full - person.special));
      person.ordinary -= transfer;
      person.special += transfer;
      person.result.oaTransferredToOwnSpecial += transfer;
    });
    people.forEach((person, personIndex) => {
      const spouse = people[1 - personIndex];
      const isSpouseAlreadyFormed = ages[1 - personIndex] >= raFormationAge;
      const personAge = ages[personIndex];
      if (isSpouseAlreadyFormed || person.ordinary <= 0 || personAge >= deathAge) return;
      const ownBalance = person.raFormed ? person.retirement : person.special;
      const giverKeepsBasic = Math.max(0, yearSums.basic - ownBalance);
      const transfer = Math.max(0, Math.min(person.ordinary - giverKeepsBasic, yearSums.full - spouse.special));
      if (transfer > 0) {
        person.ordinary -= transfer;
        spouse.special += transfer;
        person.result.oaGivenToSpouse += transfer;
        spouse.result.oaReceivedFromSpouse += transfer;
      }
    });
  }

  // Lock in the CPF LIFE payout at the reference age: record the RA balance and the
  // monthly payout, adjusted for sex, plan choice and years of deferral.
  function lockInLifePayout(person, input) {
    person.lifeLockedIn = true;
    person.result.raAtReferenceAge = person.retirement;
    let monthlyPayout = payoutAtReferenceAge(person.retirement) * tableCalibrationFactor
      * (person.isFemale ? femalePayoutFactor : 1);
    if (input.plan === 'escalating') monthlyPayout *= escalatingStartRatio;
    const deferredYears = Math.max(0, input.startAge - lifeReferenceAge);
    person.result.monthlyPayoutAtStart = monthlyPayout * Math.pow(deferralFactorPerYear, deferredYears);
  }

  function recordYearlyPayout(person, age, input, year) {
    if (age < input.startAge || !person.lifeLockedIn) return;
    if (person.result.payoutStartYear === null) person.result.payoutStartYear = year;
    let monthlyPayout = person.result.monthlyPayoutAtStart;
    if (input.plan === 'escalating') {
      monthlyPayout *= Math.pow(escalatingGrowthPerYear, year - person.result.payoutStartYear);
    }
    person.result.payoutByYear[year] = monthlyPayout * 12;
  }

  // At retirement, leftover OA becomes spendable cash (unless reserved for the mortgage).
  function spendLeftoverOrdinary(person, age, input, retirementYear, year) {
    if (!input.countOA || person.result.oaSpentYear !== null) return;
    if (age < raFormationAge || year < retirementYear) return;
    person.result.oaSpentAtRetirement = person.ordinary;
    person.result.oaSpentYear = year;
    person.ordinary = 0;
  }

  // Credit one year of interest. Once LIFE is locked in the RA is gone, so only OA grows.
  function creditInterest(person) {
    if (person.lifeLockedIn) {
      person.ordinary *= ordinaryGrowth;
      return;
    }
    const cappedOrdinary = Math.min(person.ordinary, extraInterestOrdinaryCap);
    if (!person.raFormed) {
      const extra = tieredExtraInterest([cappedOrdinary, person.special, person.medisave], extraInterestTiersBeforeRa);
      person.ordinary *= ordinaryGrowth;
      person.special = person.special * specialGrowth + extra[0] + extra[1];
      person.medisave = person.medisave * specialGrowth + extra[2];
    } else {
      const extra = tieredExtraInterest([person.retirement, cappedOrdinary, person.medisave], extraInterestTiersAfterRa);
      person.retirement = person.retirement * specialGrowth + extra[0] + extra[1];
      person.ordinary *= ordinaryGrowth;
      person.medisave = person.medisave * specialGrowth + extra[2];
    }
  }

  function advanceOneYear(people, ages, input, retirementYear, year) {
    const yearSums = yearlyRetirementSums(year, input.rsGrowth);

    people.forEach((person, personIndex) => {
      if (ages[personIndex] >= input.deathAge) return;
      if (!person.raFormed && ages[personIndex] >= raFormationAge) {
        person.result.yearAt55 = year;
        person.result.frsAt55 = yearSums.full;
        formRetirementAccountAt55(person, yearSums);
      }
      if (input.ers && person.raFormed && person.result.raAfterErsTopUp === null
        && ages[personIndex] < lifeReferenceAge) {
        topUpRetirementAccountToErs(person, yearSums);
      }
    });

    if (input.optOA) transferSpareOrdinaryToSpecial(people, ages, yearSums, input.deathAge);

    people.forEach((person, personIndex) => {
      const age = ages[personIndex];
      if (age >= input.deathAge) return;
      if (age >= lifeReferenceAge && !person.lifeLockedIn) lockInLifePayout(person, input);
      recordYearlyPayout(person, age, input, year);
      spendLeftoverOrdinary(person, age, input, retirementYear, year);
      creditInterest(person);
    });
  }

  // Year-by-year retirement budget: income needed, CPF LIFE payouts, OA spent, shortfall
  // that must come from savings.
  function buildDrawdownRows(youResult, wifeResult, input, retirementYear, yearEnding) {
    const drawdownRows = [];
    for (let year = retirementYear; year < yearEnding; year++) {
      const need = input.target * 12 * Math.pow(1 + input.inflation, year - baseYear);
      const lifePayoutYou = youResult.payoutByYear[year] || 0;
      const lifePayoutWife = wifeResult.payoutByYear[year] || 0;
      const oaSpent = (youResult.oaSpentYear === year ? youResult.oaSpentAtRetirement : 0)
        + (wifeResult.oaSpentYear === year ? wifeResult.oaSpentAtRetirement : 0);
      drawdownRows.push({
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
    return drawdownRows;
  }

  // Smallest pot at retirement that never runs below zero: walk the years backwards,
  // discounting each year's shortfall to the previous year.
  function solveSavingsNeeded(drawdownRows, postRetirementReturn) {
    let savingsNeeded = 0;
    for (let rowIndex = drawdownRows.length - 1; rowIndex >= 0; rowIndex--) {
      savingsNeeded = Math.max(0, drawdownRows[rowIndex].shortfall
        + savingsNeeded / (1 + postRetirementReturn));
    }
    return drawdownRows.length ? savingsNeeded : 0;
  }

  // Walk the pot forward to show the running balance each year.
  function simulateDrawdown(drawdownRows, startingBalance, postRetirementReturn) {
    let balance = startingBalance;
    for (const row of drawdownRows) {
      row.startBalance = balance;
      balance = Math.max(0, (balance - row.shortfall) * (1 + postRetirementReturn));
      row.endBalance = balance;
    }
  }

  function plan(input) {
    const retirementYear = baseYear + Math.max(0, input.retireAge - input.you.age);
    const yearEnding = baseYear + Math.max(input.deathAge - input.you.age, input.deathAge - input.wife.age); // exclusive
    const deflate = year => Math.pow(1 + input.inflation, year - baseYear);

    const people = [createPerson(input.you, false), createPerson(input.wife, true)];
    const ages = year => people.map(person => person.startingAge + (year - baseYear));

    formExistingRetirementAccounts(people, input.rsGrowth);
    for (let year = baseYear; year < yearEnding; year++) {
      advanceOneYear(people, ages(year), input, retirementYear, year);
    }

    const [youResult, wifeResult] = people.map(person => person.result);
    const drawdownRows = buildDrawdownRows(youResult, wifeResult, input, retirementYear, yearEnding);
    const savingsAtRetirement = solveSavingsNeeded(drawdownRows, input.rPost);
    simulateDrawdown(drawdownRows, savingsAtRetirement, input.rPost);

    const ersTopUpByPerson = [youResult, wifeResult].map(personResult => ({
      nominal: personResult.cashUsedForErsTopUp,
      todayDollars: personResult.yearAt55 ? personResult.cashUsedForErsTopUp / deflate(personResult.yearAt55) : 0,
      year: personResult.yearAt55,
    }));
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
      you: youResult,
      wife: wifeResult,
      drawdownRows,
      deflate,
    };
  }

  return { plan, retirementSum, payoutAtReferenceAge, baseYear };
}

if (typeof module !== 'undefined') module.exports = { createModel };
else if (typeof window !== 'undefined') window.RetirementModel = { createModel };
