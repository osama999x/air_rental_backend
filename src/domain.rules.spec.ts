import { AssignmentSide, AssignmentStatus, PortalRole, ProofStatus, PropertyType, ResponsibilityMode } from './common/enums';
import { addAmounts, compareAmounts, mulAmountByInt } from './common/utils/money.util';
import { normalizeEmail } from './common/utils/email.util';
import { totpCode, verifyTotp, generateTotpSecret } from './common/utils/totp.util';
import {
  canAccessThread,
  canApproveMaintenanceSpend,
  canAssignAdminFromPublicApi,
  canGrantPermissions,
  canReadDocument,
  canReadOwnerFinances,
  canReadProperty,
  canUseAdminApi,
  hasPermission,
  resolveActiveRole,
  scopeByProperty,
  Actor,
} from './modules/access/access.policy';
import { calculateRenewalExpiry } from './modules/agreements/renewal.rules';
import { billNotifyTargets } from './modules/bills/bill.rules';
import { settleDeposit } from './modules/handovers/deposit.rules';
import { buildDedupeKey, shouldCreateNotification } from './modules/notifications/notification.rules';
import { applyVerifiedWebhook } from './modules/payments/payment.rules';
import { allocatePropertyCode } from './modules/properties/property-code';
import { confirmedIncome, deriveRentStatus, netIncome, proofCountsAsIncome } from './modules/rent/rent.rules';
import { quoteSubscription } from './modules/subscriptions/subscription.rules';
import { PaymentIntentStatus } from './common/enums';
import { Permission } from './common/constants/permissions';

const now = new Date('2026-10-18T00:00:00.000Z');

function actor(partial: Partial<Actor>): Actor {
  return {
    userId: 'user-a',
    activeRole: PortalRole.OWNER,
    heldRoles: [PortalRole.OWNER],
    ownedPropertyIds: [],
    tenantPropertyIds: [],
    tenantTenancyIds: [],
    assignments: [],
    ...partial,
  };
}

describe('Air Rental business rules', () => {
  it('normalizes email and rejects duplicate-equivalent addresses', () => {
    expect(normalizeEmail('  Owner@Example.com ')).toBe('owner@example.com');
  });

  it('does not add a role when switching portals', () => {
    expect(resolveActiveRole([PortalRole.OWNER, PortalRole.TENANT], PortalRole.TENANT)).toBe(PortalRole.TENANT);
    expect(() => resolveActiveRole([PortalRole.TENANT], PortalRole.OWNER)).toThrow('ROLE_NOT_HELD');
  });

  it('keeps tenant A away from tenant B property data', () => {
    const tenantA = actor({
      activeRole: PortalRole.TENANT,
      heldRoles: [PortalRole.TENANT],
      tenantPropertyIds: ['property-a'],
      tenantTenancyIds: ['tenancy-a'],
    });
    expect(canReadProperty(tenantA, 'property-b', now)).toBe(false);
    expect(canReadOwnerFinances(tenantA, 'property-a', now)).toBe(false);
  });

  it('blocks tenant-side managers from owner finances and unassigned properties', () => {
    const manager = actor({
      userId: 'manager',
      activeRole: PortalRole.MANAGER,
      heldRoles: [PortalRole.MANAGER],
      assignments: [{
        id: 'as-1',
        side: AssignmentSide.TENANT,
        status: AssignmentStatus.ACTIVE,
        propertyIds: ['property-a'],
        permissions: [Permission.PROPERTY_VIEW, Permission.FINANCE_VIEW, Permission.RENT_APPROVE],
      }],
    });
    expect(canReadProperty(manager, 'property-b', now)).toBe(false);
    expect(canReadOwnerFinances(manager, 'property-a', now)).toBe(false);
    expect(hasPermission(manager, 'property-a', Permission.RENT_APPROVE, now)).toBe(false);
    expect(canGrantPermissions(manager, 'property-a', AssignmentSide.TENANT, [Permission.FINANCE_VIEW], now)).toBe(false);
  });

  it('removes access immediately when an assignment is revoked', () => {
    const manager = actor({
      activeRole: PortalRole.MANAGER,
      heldRoles: [PortalRole.MANAGER],
      assignments: [{
        id: 'as-2',
        side: AssignmentSide.OWNER,
        status: AssignmentStatus.REVOKED,
        propertyIds: ['property-a'],
        permissions: [Permission.PROPERTY_VIEW, Permission.DOCUMENT_VIEW],
      }],
    });
    expect(canReadProperty(manager, 'property-a', now)).toBe(false);
    expect(canReadDocument(manager, { propertyId: 'property-a', tenancyId: null, uploadedByUserId: 'other' }, now)).toBe(false);
  });

  it('keeps public callers out of admin APIs', () => {
    expect(canUseAdminApi('user')).toBe(false);
    expect(canUseAdminApi('admin')).toBe(true);
    expect(canAssignAdminFromPublicApi()).toBe(false);
  });

  it('allocates collision-safe visible property codes', async () => {
    const numbers = new Map<string, number>();
    const waiters: Array<() => void> = [];
    let busy = false;
    const codes = await Promise.all([1, 2, 3, 4, 5].map(() => allocatePropertyCode({
      lock: async (type) => {
        if (busy) await new Promise<void>((resolve) => waiters.push(resolve));
        busy = true;
        return numbers.get(type) || 0;
      },
      save: async (type, last) => {
        numbers.set(type, last);
        busy = false;
        waiters.shift()?.();
      },
    }, PropertyType.APT)));
    expect(new Set(codes).size).toBe(5);
    expect(codes.sort()).toEqual(['APT-1', 'APT-2', 'APT-3', 'APT-4', 'APT-5']);
  });

  it('keeps unapproved rent proofs out of confirmed income', () => {
    const income = confirmedIncome([
      { status: 'CONFIRMED', amount: '100.00' },
      { status: 'PENDING', amount: '40.00' },
      { status: 'REJECTED', amount: '25.00' },
    ], 'USD');
    expect(income).toBe('100.00');
    expect(proofCountsAsIncome(ProofStatus.SUBMITTED)).toBe(false);
    expect(deriveRentStatus({
      amount: '100.00',
      confirmedAmount: '40.00',
      currency: 'USD',
      dueDate: '2026-10-01',
      today: '2026-10-18',
      pendingProof: true,
      proofUnderReview: false,
    })).toBe('PROOF_SUBMITTED');
    expect(netIncome('100.00', '30.00', 'USD')).toBe('70.00');
  });

  it('does not let a partial payment exceed the remaining balance math', () => {
    expect(compareAmounts('40.00', '100.00', 'USD')).toBe(-1);
    expect(addAmounts('60.00', '40.00', 'USD')).toBe('100.00');
  });

  it('prices subscriptions by the whole tier, with one trial unit', () => {
    const quote = quoteSubscription({ activeUnits: 10, trialAvailable: true, trialUnits: 1 });
    expect(quote.planCode).toBe('STANDARD');
    expect(quote.pricePerUnit).toBe('8.00');
    expect(quote.billableUnits).toBe(9);
    expect(quote.total).toBe(mulAmountByInt('8.00', 9, 'USD'));
    const second = quoteSubscription({ activeUnits: 10, trialAvailable: false });
    expect(second.total).toBe('80.00');
    expect(quoteSubscription({ activeUnits: 151 }).planCode).toBe('AGENCY');
  });

  it('notifies only the responsible bill parties', () => {
    expect(billNotifyTargets({ mode: ResponsibilityMode.TENANT, propertyRented: true })).toEqual(['TENANT']);
    expect(billNotifyTargets({ mode: ResponsibilityMode.TENANT, propertyRented: false })).toEqual(['OWNER', 'MANAGER']);
    expect(billNotifyTargets({
      mode: ResponsibilityMode.SHARED,
      propertyRented: true,
      sharedParties: ['OWNER', 'TENANT'],
    })).toEqual(['OWNER', 'TENANT']);
  });

  it('refuses a deposit deduction above the amount received', () => {
    expect(settleDeposit({ received: '100.00', approvedDeductions: '25.00', currency: 'USD' }).refundAmount).toBe('75.00');
    expect(() => settleDeposit({ received: '100.00', approvedDeductions: '125.00', currency: 'USD' })).toThrow('DEDUCTION_EXCEEDS_DEPOSIT');
  });

  it('preserves the previous agreement when calculating a renewal', () => {
    const next = calculateRenewalExpiry({
      currentExpiry: new Date('2026-01-01T00:00:00.000Z'),
      years: 2,
    });
    expect(next.toISOString().slice(0, 10)).toBe('2028-01-01');
  });

  it('deduplicates notifications and webhooks', () => {
    expect(shouldCreateNotification(true)).toBe(false);
    expect(buildDedupeKey('rent.reminder', ['ob-1', '2026-10'])).toBe('rent.reminder:ob-1:2026-10');
    const seen = new Set<string>();
    const first = applyVerifiedWebhook(
      { status: PaymentIntentStatus.PENDING },
      { eventId: 'evt-1', status: PaymentIntentStatus.SUCCEEDED },
      seen,
    );
    const second = applyVerifiedWebhook(first.state, { eventId: 'evt-1', status: PaymentIntentStatus.SUCCEEDED }, seen);
    expect(first.applyFinancialEffect).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(second.applyFinancialEffect).toBe(false);
  });

  it('scopes AI context to properties the actor can read', () => {
    const tenant = actor({
      activeRole: PortalRole.TENANT,
      heldRoles: [PortalRole.TENANT],
      tenantPropertyIds: ['property-a'],
    });
    const scoped = scopeByProperty(tenant, [
      { propertyId: 'property-a', secret: 'visible' },
      { propertyId: 'property-b', secret: 'hidden' },
    ], now);
    expect(scoped).toEqual([{ propertyId: 'property-a', secret: 'visible' }]);
  });

  it('limits chat to participants and spend approvals to the owner threshold', () => {
    expect(canAccessThread(['owner', 'tenant'], 'stranger')).toBe(false);
    const manager = actor({
      activeRole: PortalRole.MANAGER,
      heldRoles: [PortalRole.MANAGER],
      assignments: [{
        id: 'as-3',
        side: AssignmentSide.OWNER,
        status: AssignmentStatus.ACTIVE,
        propertyIds: ['property-a'],
        permissions: [Permission.MAINTENANCE_APPROVE],
        spendLimit: '500.00',
      }],
    });
    expect(canApproveMaintenanceSpend(manager, 'property-a', '600.00', 'USD', now)).toBe(false);
    expect(canApproveMaintenanceSpend(manager, 'property-a', '500.00', 'USD', now)).toBe(true);
  });

  it('hides owner-only documents from tenants', () => {
    const tenant = actor({
      activeRole: PortalRole.TENANT,
      heldRoles: [PortalRole.TENANT],
      tenantPropertyIds: ['property-a'],
      tenantTenancyIds: ['tenancy-a'],
    });
    expect(canReadDocument(tenant, { propertyId: 'property-a', tenancyId: null, uploadedByUserId: 'owner' }, now)).toBe(false);
    expect(canReadDocument(tenant, { propertyId: 'property-a', tenancyId: 'tenancy-a', uploadedByUserId: 'owner' }, now)).toBe(true);
  });

  it('verifies a TOTP code generated from the same secret', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, totpCode(secret))).toBe(true);
    expect(verifyTotp(secret, '000000')).toBe(false);
  });
});
