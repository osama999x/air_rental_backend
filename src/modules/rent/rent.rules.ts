import { ProofStatus, RentStatus } from '../../common/enums';
import {
  clampRemaining,
  compareAmounts,
  subAmounts,
  sumAmounts,
  zeroAmount,
} from '../../common/utils/money.util';

export interface RentSnapshotInput {
  amount: string;
  confirmedAmount: string;
  currency: string;
  dueDate: string;
  today: string;
  pendingProof: boolean;
  proofUnderReview: boolean;
}

export function deriveRentStatus(input: RentSnapshotInput): RentStatus {
  const { remaining } = clampRemaining(
    input.amount,
    input.confirmedAmount,
    input.currency,
  );
  const paidInFull = compareAmounts(remaining, zeroAmount(input.currency), input.currency) === 0
    && compareAmounts(input.confirmedAmount, zeroAmount(input.currency), input.currency) >= 0
    && compareAmounts(input.confirmedAmount, input.amount, input.currency) >= 0;
  if (paidInFull) return RentStatus.PAID;
  if (input.proofUnderReview) return RentStatus.UNDER_REVIEW;
  if (input.pendingProof) return RentStatus.PROOF_SUBMITTED;
  const partial =
    compareAmounts(input.confirmedAmount, zeroAmount(input.currency), input.currency) > 0;
  if (input.dueDate < input.today) return RentStatus.OVERDUE;
  if (partial) return RentStatus.PARTIAL;
  if (input.dueDate === input.today) return RentStatus.DUE;
  return RentStatus.UPCOMING;
}

export function confirmedIncome(
  payments: Array<{ status: string; amount: string }>,
  currency: string,
): string {
  return sumAmounts(
    payments.filter((payment) => payment.status === 'CONFIRMED').map((payment) => payment.amount),
    currency,
  );
}

export function proofCountsAsIncome(status: ProofStatus | string): boolean {
  return status === ProofStatus.APPROVED;
}

export function netIncome(income: string, expenses: string, currency: string): string {
  return subAmounts(income, expenses, currency);
}
