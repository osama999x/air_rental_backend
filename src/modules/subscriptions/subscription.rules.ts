import { mulAmountByInt, zeroAmount } from '../../common/utils/money.util';

export interface PlanTier {
  code: string;
  minUnits: number;
  maxUnits: number | null;
  pricePerUnit: string;
}

export const DEFAULT_TIERS: PlanTier[] = [
  { code: 'STARTER', minUnits: 1, maxUnits: 5, pricePerUnit: '10.00' },
  { code: 'STANDARD', minUnits: 6, maxUnits: 15, pricePerUnit: '8.00' },
  { code: 'ADVANCED', minUnits: 16, maxUnits: 50, pricePerUnit: '6.00' },
  { code: 'PROFESSIONAL', minUnits: 51, maxUnits: 150, pricePerUnit: '4.00' },
  { code: 'AGENCY', minUnits: 151, maxUnits: null, pricePerUnit: '2.00' },
];

export interface SubscriptionQuote {
  planCode: string | null;
  activeUnits: number;
  pricePerUnit: string;
  total: string;
  currency: string;
  trialApplied: boolean;
  trialUnitsApplied: number;
  billableUnits: number;
}

export function selectTier(activeUnits: number, tiers: PlanTier[] = DEFAULT_TIERS): PlanTier | null {
  if (activeUnits < 1) return null;
  return (
    tiers.find(
      (tier) =>
        activeUnits >= tier.minUnits &&
        (tier.maxUnits === null || activeUnits <= tier.maxUnits),
    ) || null
  );
}

/**
 * The plan is chosen from the total active unit count.
 * That tier's per-unit rate applies to every billable unit.
 * The one-time Starter trial waives exactly one unit for the trial period.
 */
export function quoteSubscription(input: {
  activeUnits: number;
  currency?: string;
  tiers?: PlanTier[];
  trialAvailable?: boolean;
  trialUnits?: number;
}): SubscriptionQuote {
  const currency = input.currency || 'USD';
  const tiers = input.tiers || DEFAULT_TIERS;
  const tier = selectTier(input.activeUnits, tiers);
  if (!tier) {
    return {
      planCode: null,
      activeUnits: 0,
      pricePerUnit: zeroAmount(currency),
      total: zeroAmount(currency),
      currency,
      trialApplied: false,
      trialUnitsApplied: 0,
      billableUnits: 0,
    };
  }
  const trialUnitsApplied =
    input.trialAvailable && input.activeUnits > 0
      ? Math.min(input.trialUnits ?? 1, input.activeUnits)
      : 0;
  const billableUnits = input.activeUnits - trialUnitsApplied;
  return {
    planCode: tier.code,
    activeUnits: input.activeUnits,
    pricePerUnit: tier.pricePerUnit,
    total: mulAmountByInt(tier.pricePerUnit, billableUnits, currency),
    currency,
    trialApplied: trialUnitsApplied > 0,
    trialUnitsApplied,
    billableUnits,
  };
}
