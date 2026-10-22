import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import {
  ManagerAssignment,
  ManagerAssignmentProperty,
  Organization,
  OrganizationMember,
  Property,
  Tenancy,
  UserRole,
} from '../../database/entities';
import {
  AssignmentStatus,
  MembershipStatus,
  OrganizationMemberRole,
  PortalRole,
  TenancyStatus,
} from '../../common/enums';
import { PermissionKey } from '../../common/constants/permissions';
import {
  Actor,
  canApproveMaintenanceSpend,
  canGrantPermissions,
  canReadDocument,
  canReadOwnerFinances,
  canReadProperty,
  hasPermission,
} from './access.policy';
import { AssignmentSide } from '../../common/enums';

@Injectable()
export class AccessService {
  constructor(
    @InjectRepository(UserRole) private readonly roles: Repository<UserRole>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(Tenancy) private readonly tenancies: Repository<Tenancy>,
    @InjectRepository(ManagerAssignment) private readonly assignments: Repository<ManagerAssignment>,
    @InjectRepository(ManagerAssignmentProperty)
    private readonly assignmentProperties: Repository<ManagerAssignmentProperty>,
    @InjectRepository(OrganizationMember)
    private readonly members: Repository<OrganizationMember>,
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
  ) {}

  async actor(userId: string, activeRole: PortalRole | null): Promise<Actor> {
    const heldRoles = (await this.roles.find({ where: { userId } })).map((role) => role.role);
    const memberships = await this.members.find({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        memberRole: In([OrganizationMemberRole.OWNER, OrganizationMemberRole.ADMIN]),
      },
    });
    const createdOrgs = await this.organizations.find({ where: { createdByUserId: userId } });
    const organizationIds = [
      ...new Set([
        ...memberships.map((member) => member.organizationId),
        ...createdOrgs.map((organization) => organization.id),
      ]),
    ];
    const owned = await this.properties.find({
      where: [{ ownerUserId: userId, archivedAt: IsNull() }],
      select: ['id', 'organizationId', 'ownerUserId'],
    });
    const orgOwned = organizationIds.length
      ? await this.properties.find({
          where: { organizationId: In(organizationIds), archivedAt: IsNull() },
          select: ['id'],
        })
      : [];
    const tenantRows = await this.tenancies.find({
      where: {
        tenantUserId: userId,
        status: In([
          TenancyStatus.ACCEPTED,
          TenancyStatus.ACTIVE,
          TenancyStatus.TERMINATED,
          TenancyStatus.COMPLETED,
        ]),
      },
    });
    const assignmentRows = await this.assignments.find({ where: { managerUserId: userId } });
    const links = assignmentRows.length
      ? await this.assignmentProperties.find({
          where: { assignmentId: In(assignmentRows.map((row) => row.id)) },
        })
      : [];
    return {
      userId,
      activeRole,
      heldRoles,
      ownedPropertyIds: [...new Set([...owned.map((row) => row.id), ...orgOwned.map((row) => row.id)])],
      tenantPropertyIds: tenantRows.map((row) => row.propertyId),
      tenantTenancyIds: tenantRows.map((row) => row.id),
      assignments: assignmentRows.map((row) => ({
        id: row.id,
        side: row.side,
        status: row.status === AssignmentStatus.ACTIVE && row.endsAt && row.endsAt <= new Date()
          ? AssignmentStatus.EXPIRED
          : row.status,
        propertyIds: links.filter((link) => link.assignmentId === row.id).map((link) => link.propertyId),
        tenancyId: row.tenancyId,
        permissions: row.permissions || [],
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        spendLimit: row.spendLimit,
      })),
    };
  }

  async assertProperty(userId: string, role: PortalRole | null, propertyId: string) {
    const actor = await this.actor(userId, role);
    if (!canReadProperty(actor, propertyId, new Date())) {
      throw new ForbiddenException('You cannot access this property');
    }
    return actor;
  }

  async assertPermission(
    userId: string,
    role: PortalRole | null,
    propertyId: string,
    permission: PermissionKey,
    tenancyId?: string,
  ) {
    const actor = await this.actor(userId, role);
    if (!hasPermission(actor, propertyId, permission, new Date(), tenancyId)) {
      throw new ForbiddenException('You do not have permission for this action');
    }
    return actor;
  }

  async assertFinance(userId: string, role: PortalRole | null, propertyId: string) {
    const actor = await this.actor(userId, role);
    if (!canReadOwnerFinances(actor, propertyId, new Date())) {
      throw new ForbiddenException('Owner financial records are not available in this portal');
    }
    return actor;
  }

  async assertGrant(
    userId: string,
    role: PortalRole | null,
    propertyId: string,
    side: AssignmentSide,
    permissions: string[],
  ) {
    const actor = await this.actor(userId, role);
    if (!canGrantPermissions(actor, propertyId, side, permissions, new Date())) {
      throw new ForbiddenException('You cannot grant permissions you do not hold');
    }
    return actor;
  }

  async assertSpend(
    userId: string,
    role: PortalRole | null,
    propertyId: string,
    amount: string,
    currency: string,
  ) {
    const actor = await this.actor(userId, role);
    if (!canApproveMaintenanceSpend(actor, propertyId, amount, currency, new Date())) {
      throw new ForbiddenException('This spend is above the authorized approval threshold');
    }
    return actor;
  }

  async assertDocument(
    userId: string,
    role: PortalRole | null,
    document: { propertyId?: string | null; tenancyId?: string | null; uploadedByUserId?: string | null },
  ) {
    const actor = await this.actor(userId, role);
    if (!canReadDocument(actor, document, new Date())) {
      throw new ForbiddenException('You cannot access this document');
    }
    return actor;
  }
}
