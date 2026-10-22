import { PaymentIntentStatus } from '../../common/enums';

export interface PaymentState {
  status: PaymentIntentStatus;
}

export function applyVerifiedWebhook(
  current: PaymentState,
  event: { eventId: string; status: PaymentIntentStatus },
  seenEventIds: Set<string>,
): { duplicate: boolean; state: PaymentState; applyFinancialEffect: boolean } {
  if (seenEventIds.has(event.eventId)) {
    return { duplicate: true, state: current, applyFinancialEffect: false };
  }
  seenEventIds.add(event.eventId);
  if (current.status === PaymentIntentStatus.SUCCEEDED) {
    return { duplicate: false, state: current, applyFinancialEffect: false };
  }
  const next = { status: event.status };
  return {
    duplicate: false,
    state: next,
    applyFinancialEffect: event.status === PaymentIntentStatus.SUCCEEDED,
  };
}

export function rejectUnverifiedClientSuccess(): never {
  throw new Error('UNVERIFIED_CLIENT_REDIRECT');
}
