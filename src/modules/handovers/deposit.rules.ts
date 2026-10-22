import {
  compareAmounts,
  subAmounts,
  zeroAmount,
} from '../../common/utils/money.util';

export function settleDeposit(input: {
  received: string;
  approvedDeductions: string;
  currency: string;
}) {
  if (
    compareAmounts(input.approvedDeductions, input.received, input.currency) > 0
  ) {
    throw new Error('DEDUCTION_EXCEEDS_DEPOSIT');
  }
  const refund = subAmounts(
    input.received,
    input.approvedDeductions,
    input.currency,
  );
  return {
    refundAmount: refund,
    remainingBalance: zeroAmount(input.currency),
    deductionAmount: input.approvedDeductions,
  };
}
