import {
  OWNER_PERMISSIONS,
  PermissionKey,
  TENANT_MANAGER_FORBIDDEN,
  TENANT_PERMISSIONS,
} from '../../common/constants/permissions';
import { AssignmentSide, AssignmentStatus, PortalRole } from '../../common/enums';
import { compareAmounts } from '../../common/utils/money.util';

export interface AssignmentView {
  id: string;
  side: AssignmentSide;
  status: AssignmentStatus;
  propertyIds: string[];
  tenancyId?: string | null;
  permissions: string[];
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  spendLimit?: string | null;
}

export interface Actor {
  userId: string;
  activeRole: PortalRole | null;
  heldRoles: PortalRole[];
  ownedPropertyIds: string[];
  tenantPropertyIds: string[];
  tenantTenancyIds: string[];
  assignments: AssignmentView[];
}

export function isAssignmentActive(assignment: AssignmentView, now: Date): boolean {
  if (assignment.status !== AssignmentStatus.ACTIVE) return false;
  if (assignment.startsAt && new Date(assignment.startsAt) > now) return false;
  if (assignment.endsAt && new Date(assignment.endsAt) <= now) return false;
  return true;
}

export function resolveActiveRole(
  held: PortalRole[],
  requested?: string | null,
  preferred?: PortalRole | null,
): PortalRole | null {
  if (held.length === 0) return null;
  const candidate = (requested || preferred || held[0]) as PortalRole;
  if (!held.includes(candidate)) {
    throw new Error('ROLE_NOT_HELD');
  }
  return candidate;
}

function roleHeld(actor: Actor): boolean {
  return Boolean(actor.activeRole && actor.heldRoles.includes(actor.activeRole));
}

export function activeAssignments(actor: Actor, now: Date): AssignmentView[] {
  if (actor.activeRole !== PortalRole.MANAGER) return [];
  return actor.assignments.filter((assignment) => isAssignmentActive(assignment, now));
}

export function canReadProperty(actor: Actor, propertyId: string, now: Date): boolean {
  if (!roleHeld(actor)) return false;
  if (actor.activeRole === PortalRole.OWNER) {
    return actor.ownedPropertyIds.includes(propertyId);
  }
  if (actor.activeRole === PortalRole.TENANT) {
    return actor.tenantPropertyIds.includes(propertyId);
  }
  return activeAssignments(actor, now).some(
    (assignment) =>
      assignment.propertyIds.includes(propertyId) &&
      assignment.permissions.includes('PROPERTY_VIEW'),
  );
}

export function canReadOwnerFinances(
  actor: Actor,
  propertyId: string,
  now: Date,
): boolean {
  if (!roleHeld(actor) || actor.activeRole === PortalRole.TENANT) return false;
  if (actor.activeRole === PortalRole.OWNER) {
    return actor.ownedPropertyIds.includes(propertyId);
  }
  return activeAssignments(actor, now).some(
    (assignment) =>
      assignment.side === AssignmentSide.OWNER &&
      assignment.propertyIds.includes(propertyId) &&
      assignment.permissions.includes('FINANCE_VIEW'),
  );
}

export function hasPermission(
  actor: Actor,
  propertyId: string,
  permission: PermissionKey,
  now: Date,
  tenancyId?: string,
): boolean {
  if (!roleHeld(actor)) return false;
  if (actor.activeRole === PortalRole.OWNER) {
    return (
      actor.ownedPropertyIds.includes(propertyId) &&
      OWNER_PERMISSIONS.includes(permission)
    );
  }
  if (actor.activeRole === PortalRole.TENANT) {
    const propertyOk = actor.tenantPropertyIds.includes(propertyId);
    const tenancyOk = !tenancyId || actor.tenantTenancyIds.includes(tenancyId);
    return propertyOk && tenancyOk && TENANT_PERMISSIONS.includes(permission);
  }
  return activeAssignments(actor, now).some((assignment) => {
    if (!assignment.propertyIds.includes(propertyId)) return false;
    if (tenancyId && assignment.tenancyId && assignment.tenancyId !== tenancyId) {
      return false;
    }
    if (
      assignment.side === AssignmentSide.TENANT &&
      TENANT_MANAGER_FORBIDDEN.includes(permission)
    ) {
      return false;
    }
    return assignment.permissions.includes(permission);
  });
}

export function canGrantPermissions(
  actor: Actor,
  propertyId: string,
  side: AssignmentSide,
  requested: string[],
  now: Date,
): boolean {
  if (!hasPermission(actor, propertyId, 'MANAGER_ASSIGN', now)) return false;
  if (actor.activeRole === PortalRole.TENANT && side !== AssignmentSide.TENANT) {
    return false;
  }
  if (actor.activeRole === PortalRole.MANAGER) {
    const assignment = activeAssignments(actor, now).find((item) =>
      item.propertyIds.includes(propertyId),
    );
    if (!assignment || assignment.side !== side) return false;
  }
  if (
    side === AssignmentSide.TENANT &&
    requested.some((permission) =>
      TENANT_MANAGER_FORBIDDEN.includes(permission as PermissionKey),
    )
  ) {
    return false;
  }
  return requested.every((permission) =>
    hasPermission(actor, propertyId, permission as PermissionKey, now),
  );
}

export function canApproveMaintenanceSpend(
  actor: Actor,
  propertyId: string,
  amount: string,
  currency: string,
  now: Date,
): boolean {
  if (actor.activeRole === PortalRole.OWNER) {
    return actor.ownedPropertyIds.includes(propertyId);
  }
  if (actor.activeRole !== PortalRole.MANAGER) return false;
  const assignment = activeAssignments(actor, now).find(
    (item) =>
      item.side === AssignmentSide.OWNER &&
      item.propertyIds.includes(propertyId) &&
      item.permissions.includes('MAINTENANCE_APPROVE'),
  );
  if (!assignment?.spendLimit) return false;
  return compareAmounts(amount, assignment.spendLimit, currency) <= 0;
}

export function canReadDocument(
  actor: Actor,
  document: {
    propertyId?: string | null;
    tenancyId?: string | null;
    uploadedByUserId?: string | null;
  },
  now: Date,
): boolean {
  if (!document.propertyId) {
    return document.uploadedByUserId === actor.userId;
  }
  if (actor.activeRole === PortalRole.TENANT) {
    if (!document.tenancyId) return false;
    return (
      actor.tenantTenancyIds.includes(document.tenancyId) &&
      actor.tenantPropertyIds.includes(document.propertyId)
    );
  }
  if (actor.activeRole === PortalRole.MANAGER) {
    return hasPermission(actor, document.propertyId, 'DOCUMENT_VIEW', now, document.tenancyId || undefined);
  }
  return canReadProperty(actor, document.propertyId, now);
}

export function canAccessThread(participantUserIds: string[], userId: string): boolean {
  return participantUserIds.includes(userId);
}

export function scopeByProperty<T extends { propertyId: string }>(
  actor: Actor,
  records: T[],
  now: Date,
): T[] {
  return records.filter((record) => canReadProperty(actor, record.propertyId, now));
}

export function canUseAdminApi(audience?: string): boolean {
  return audience === 'admin';
}

export function canAssignAdminFromPublicApi(): boolean {
  return false;
}
