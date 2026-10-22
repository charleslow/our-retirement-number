import type { ExtraInterestTier } from './types';

// Spread the account balances across the tiers in order, filling each tier
// before the next, and return the extra interest earned by each account.
export function tieredExtraInterest(accountBalances: number[], tiers: ExtraInterestTier[]): number[] {
  const extraByAccount = accountBalances.map(() => 0);
  if (tiers.length === 0) return extraByAccount;
  let tierIndex = 0;
  let tierRemaining = tiers[0].balance;
  accountBalances.forEach((balanceToAllocate, accountIndex) => {
    while (balanceToAllocate > 0 && tierIndex < tiers.length) {
      const amountInTier = Math.min(balanceToAllocate, tierRemaining);
      extraByAccount[accountIndex] += amountInTier * tiers[tierIndex].rate;
      balanceToAllocate -= amountInTier;
      tierRemaining -= amountInTier;
      if (tierRemaining <= 0) {
        tierIndex++;
        if (tierIndex < tiers.length) tierRemaining = tiers[tierIndex].balance;
      }
    }
  });
  return extraByAccount;
}
