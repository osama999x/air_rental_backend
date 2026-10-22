import { addUtcYears } from '../../common/utils/dates.util';

export function calculateRenewalExpiry(input: {
  currentExpiry: Date;
  years?: number;
  customEndDate?: string;
}): Date {
  if (input.customEndDate) {
    const custom = new Date(`${input.customEndDate}T00:00:00.000Z`);
    if (Number.isNaN(custom.getTime()) || custom <= input.currentExpiry) {
      throw new Error('CUSTOM_END_DATE_INVALID');
    }
    return custom;
  }
  if (!input.years || input.years < 1 || input.years > 30 || !Number.isInteger(input.years)) {
    throw new Error('RENEWAL_YEARS_INVALID');
  }
  return addUtcYears(input.currentExpiry, input.years);
}

export function withinFinalMonths(expiry: Date, now: Date, months = 2): boolean {
  const boundary = new Date(expiry.getTime());
  boundary.setUTCMonth(boundary.getUTCMonth() - months);
  return now >= boundary && now < expiry;
}
