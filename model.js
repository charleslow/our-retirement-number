// Household retirement demand model (Singapore / CPF). Annual steps, nominal dollars, year 0 = 2026.
const BASE_YEAR = 2026;

// Announced: FRS 2026 $220,400, 2027 $228,200; grows at g after. BRS = FRS/2, ERS = 2 x FRS.
function retSum(kind, year, g) {
  const frs = year <= 2026 ? 220400 : year === 2027 ? 228200 : 228200 * Math.pow(1 + g, year - 2027);
  return kind === 'BRS' ? frs / 2 : kind === 'ERS' ? frs * 2 : frs;
}

// CPF LIFE Standard Plan, male, payout from 65, vs RA balance at 65 (CPF Board reference table, 2026).
const PAYOUT_PTS = [[82400, 490], [170100, 950], [227900, 1250], [330100, 1780], [445600, 2380], [650100, 3440]];
function payoutAt65(ra65) {
  if (ra65 <= 0) return 0;
  const r = PAYOUT_PTS.map(([a, p]) => [a, p / a]);
  let ratio = r[r.length - 1][1];
  if (ra65 <= r[0][0]) ratio = r[0][1];
  else for (let i = 0; i < r.length - 1; i++) {
    if (ra65 >= r[i][0] && ra65 <= r[i + 1][0]) {
      const f = (ra65 - r[i][0]) / (r[i + 1][0] - r[i][0]);
      ratio = r[i][1] + f * (r[i + 1][1] - r[i][1]);
      break;
    }
  }
  return ra65 * ratio;
}

// Extra interest: balances in priority order, tiers [[size, rate], ...]. Returns extra interest per account.
function tiered(amounts, tiers) {
  const out = amounts.map(() => 0);
  let ti = 0, left = tiers[0][0];
  for (let i = 0; i < amounts.length; i++) {
    let a = amounts[i];
    while (a > 0 && ti < tiers.length) {
      const take = Math.min(a, left);
      out[i] += take * tiers[ti][1];
      a -= take; left -= take;
      if (left <= 0) { ti++; if (ti < tiers.length) left = tiers[ti][0]; }
    }
  }
  return out;
}

// inp: {target, retireAge, deathAge, inflation, rPost, rsGrowth, startAge, plan, countOA, optOA, ers,
//       you:{age,oa,sa,ma}, wife:{age,oa,sa,ma}}
function plan(inp) {
  const g = inp.rsGrowth;
  const yRet = BASE_YEAR + Math.max(0, inp.retireAge - inp.you.age);
  const yEnd = BASE_YEAR + Math.max(inp.deathAge - inp.you.age, inp.deathAge - inp.wife.age); // exclusive
  const defl = y => Math.pow(1 + inp.inflation, y - BASE_YEAR);

  const people = [inp.you, inp.wife].map((p, idx) => ({
    female: idx === 1, age0: p.age, oa: p.oa, sa: p.sa, ma: p.ma, ra: 0, formed: false,
    out: { y55: null, frsCohort: null, ersCohort: null, raFormed: null, oaToOwnSA: 0, oaToSpouse: 0, fromSpouse: 0,
      oaToRA: 0, cashTopUp: 0, raAfterTopUp: null, ra65: null, y65: BASE_YEAR + 65 - p.age, monthlyStart: 0,
      startYear: null, oaLump: 0, oaLumpYear: null, payoutByYear: {} }
  }));
  for (const p of people) if (p.age0 >= 55) {
    p.ra = p.sa; p.sa = 0; p.formed = true;
    Object.assign(p.out, { raFormed: p.ra, y55: BASE_YEAR, frsCohort: retSum('FRS', BASE_YEAR, g) });
  }

  for (let y = BASE_YEAR; y < yEnd; y++) {
    const frs = retSum('FRS', y, g), brs = frs / 2, ers = frs * 2;
    const ages = people.map(p => p.age0 + (y - BASE_YEAR));

    // 1. At 55: SA then OA fill the RA up to the FRS; SA above the FRS goes to OA. Then optional ERS top-up: OA first, then cash.
    people.forEach((p, i) => {
      const a = ages[i];
      if (a >= inp.deathAge) return;
      if (!p.formed && a >= 55) {
        Object.assign(p.out, { y55: y, frsCohort: frs });
        const fromSA = Math.min(p.sa, frs);
        p.ra = fromSA; p.oa += p.sa - fromSA; p.sa = 0;
        const fromOA = Math.min(p.oa, frs - p.ra);
        p.ra += fromOA; p.oa -= fromOA;
        p.formed = true; p.out.raFormed = p.ra;
      }
      if (inp.ers && p.formed && p.out.raAfterTopUp === null && a < 65) {
        p.out.ersCohort = ers;
        const need = Math.max(0, ers - p.ra);
        const fromOA = Math.min(p.oa, need);
        p.oa -= fromOA; p.out.oaToRA = fromOA;
        p.out.cashTopUp = need - fromOA;
        p.ra += need; p.out.raAfterTopUp = p.ra;
      }
    });

    // 2. Optional: move spare OA into SA each year, own SA first, then the spouse's, up to the current FRS.
    if (inp.optOA) {
      people.forEach((p, i) => {
        if (ages[i] < 55) { const t = Math.max(0, Math.min(p.oa, frs - p.sa)); p.oa -= t; p.sa += t; p.out.oaToOwnSA += t; }
      });
      people.forEach((p, i) => {
        const q = people[1 - i];
        if (ages[1 - i] >= 55 || p.oa <= 0 || ages[i] >= inp.deathAge) return;
        const keep = Math.max(0, brs - (p.formed ? p.ra : p.sa)); // giver keeps the BRS
        const t = Math.max(0, Math.min(p.oa - keep, frs - q.sa));
        if (t > 0) { p.oa -= t; q.sa += t; p.out.oaToSpouse += t; q.out.fromSpouse += t; }
      });
    }

    // 3. CPF LIFE payouts, leftover OA, interest.
    people.forEach((p, i) => {
      const a = ages[i];
      if (a >= inp.deathAge) return;
      if (a >= 65 && p.out.ra65 === null) {
        p.out.ra65 = p.ra;
        let m = payoutAt65(p.ra) * 0.98 * (p.female ? 0.95 : 1); // 0.98 calibrates to CPF's published FRS/ERS payouts
        if (inp.plan === 'escalating') m *= 1380 / 1780;
        p.out.monthlyStart = m * Math.pow(1.06, Math.max(0, inp.startAge - 65));
      }
      if (a >= inp.startAge && p.out.ra65 !== null) {
        if (p.out.startYear === null) p.out.startYear = y;
        let m = p.out.monthlyStart;
        if (inp.plan === 'escalating') m *= Math.pow(1.02, y - p.out.startYear);
        p.out.payoutByYear[y] = m * 12;
      }
      if (inp.countOA && p.out.oaLumpYear === null && a >= 55 && y >= yRet) {
        p.out.oaLump = p.oa; p.out.oaLumpYear = y; p.oa = 0;
      }
      if (p.out.ra65 === null) {
        if (!p.formed) {
          const ex = tiered([Math.min(p.oa, 20000), p.sa, p.ma], [[60000, 0.01]]);
          p.oa *= 1.025; p.sa = p.sa * 1.04 + ex[0] + ex[1]; p.ma = p.ma * 1.04 + ex[2];
        } else {
          const ex = tiered([p.ra, Math.min(p.oa, 20000), p.ma], [[30000, 0.02], [30000, 0.01]]);
          p.ra = p.ra * 1.04 + ex[0] + ex[1]; p.oa *= 1.025; p.ma = p.ma * 1.04 + ex[2];
        }
      } else {
        p.oa *= 1.025;
      }
    });
  }

  const [you, wife] = people.map(p => p.out);
  const rows = [];
  for (let y = yRet; y < yEnd; y++) {
    const need = inp.target * 12 * defl(y);
    const cYou = you.payoutByYear[y] || 0, cWife = wife.payoutByYear[y] || 0;
    const oaIn = (you.oaLumpYear === y ? you.oaLump : 0) + (wife.oaLumpYear === y ? wife.oaLump : 0);
    rows.push({ y, ageYou: inp.you.age + (y - BASE_YEAR), ageWife: inp.wife.age + (y - BASE_YEAR), need, cYou, cWife, oaIn,
      gap: need - cYou - cWife - oaIn });
  }
  // Smallest pot at retirement that never runs below zero.
  let P = 0;
  for (let k = rows.length - 1; k >= 0; k--) P = Math.max(0, rows[k].gap + P / (1 + inp.rPost));
  const pot = rows.length ? P : 0;
  let bal = pot;
  for (const row of rows) { row.start = bal; bal = Math.max(0, (bal - row.gap) * (1 + inp.rPost)); row.end = bal; }

  const cash55 = [you, wife].map(o => ({ nominal: o.cashTopUp, today: o.y55 ? o.cashTopUp / defl(o.y55) : 0, y: o.y55 }));
  const cash55Today = cash55[0].today + cash55[1].today;
  const potToday = pot / defl(yRet);
  return { yRet, yEnd, pot, potToday, cash55, cash55Today, totalToday: cash55Today + potToday, you, wife, rows, defl };
}

if (typeof module !== 'undefined') module.exports = { plan, payoutAt65, retSum };
