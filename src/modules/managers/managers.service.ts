import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AssignmentSide, AssignmentStatus, PortalRole } from '../../common/enums';
import {
  ManagerAssignment,
  ManagerAssignmentProperty,
  Tenancy,
  User,
  UserRole,
} from '../../database/entities';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { normalizeEmail } from '../../common/utils/email.util';

@Injectable()
export class ManagersService {
  constructor(
    @InjectRepository(ManagerAssignment) private readonly assignments: Repository<ManagerAssignment>,
    @InjectRepository(ManagerAssignmentProperty)
    private readonly links: Repository<ManagerAssignmentProperty>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserRole) private readonly roles: Repository<UserRole>,
    @InjectRepository(Tenancy) private readonly tenancies: Repository<Tenancy>,
    private readonly dataSource: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async assign(userId: string, role: PortalRole | null, input: {
    managerEmail: string;
    side: AssignmentSide;
    propertyIds: string[];
    tenancyId?: string;
    permissions: string[];
    startsAt?: string;
    endsAt?: string;
    spendLimit?: string;
  }) {
    if (!input.propertyIds.length) throw new BadRequestException('Select at least one property');
    for (const propertyId of input.propertyIds) {
      await this.access.assertGrant(userId, role, propertyId, input.side, input.permissions);
    }
    if (input.side === AssignmentSide.TENANT && input.tenancyId) {
      const tenancy = await this.tenancies.findOne({ where: { id: input.tenancyId } });
      if (!tenancy || tenancy.tenantUserId !== userId && role === PortalRole.TENANT) {
        throw new BadRequestException('Tenant managers can only be assigned to your tenancy');
      }
    }
    const manager = await this.users.findOne({ where: { email: normalizeEmail(input.managerEmail) } });
    if (!manager) throw new NotFoundException('Manager account was not found');
    const managerRole = await this.roles.findOne({ where: { userId: manager.id, role: PortalRole.MANAGER } });
    if (!managerRole) throw new BadRequestException('That user has not enabled the manager portal');
    const saved = await this.dataSource.transaction(async (managerDb) => {
      const assignment = await managerDb.save(managerDb.create(ManagerAssignment, {
        assigningUserId: userId,
        managerUserId: manager.id,
        side: input.side,
        status: AssignmentStatus.PENDING,
        startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        permissions: input.permissions,
        spendLimit: input.side === AssignmentSide.OWNER ? input.spendLimit : null,
        tenancyId: input.tenancyId,
      }));
      for (const propertyId of input.propertyIds) {
        await managerDb.save(managerDb.create(ManagerAssignmentProperty, {
          assignmentId: assignment.id,
          propertyId,
        }));
      }
      return assignment;
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'manager.assigned',
      entityType: 'manager_assignment',
      entityId: saved.id,
      metadata: { side: input.side, permissions: input.permissions.join(',') },
    });
    return saved;
  }

  async respond(userId: string, role: PortalRole | null, assignmentId: string, accept: boolean) {
    const assignment = await this.assignments.findOne({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment was not found');
    if (assignment.managerUserId !== userId) {
      throw new ForbiddenException('Only the assigned manager can respond');
    }
    if (assignment.status !== AssignmentStatus.PENDING) {
      throw new BadRequestException('This assignment is no longer waiting for a response');
    }
    assignment.status = accept ? AssignmentStatus.ACTIVE : AssignmentStatus.REVOKED;
    if (!accept) assignment.endsAt = new Date();
    await this.assignments.save(assignment);
    await this.notifications.notify({
      userId: assignment.assigningUserId,
      type: accept ? 'manager.accepted' : 'manager.declined',
      title: accept ? 'Manager accepted' : 'Manager declined',
      body: accept
        ? 'A manager accepted the assignment.'
        : 'A manager declined the assignment.',
      dedupeParts: [assignment.id, accept ? 'accepted' : 'declined'],
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: accept ? 'manager.accepted' : 'manager.declined',
      entityType: 'manager_assignment',
      entityId: assignmentId,
    });
    return assignment;
  }

  async revoke(userId: string, role: PortalRole | null, assignmentId: string) {
    const assignment = await this.assignments.findOne({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment was not found');
    const links = await this.links.find({ where: { assignmentId } });
    if (assignment.assigningUserId !== userId) {
      for (const link of links) {
        await this.access.assertPermission(userId, role, link.propertyId, 'MANAGER_ASSIGN');
      }
    }
    assignment.status = AssignmentStatus.REVOKED;
    await this.assignments.save(assignment);
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'manager.revoked',
      entityType: 'manager_assignment',
      entityId: assignmentId,
    });
    return assignment;
  }

  async list(userId: string, role: PortalRole | null) {
    if (role === PortalRole.MANAGER) {
      return this.assignments.find({ where: { managerUserId: userId }, order: { createdAt: 'DESC' } });
    }
    return this.assignments.find({ where: { assigningUserId: userId }, order: { createdAt: 'DESC' } });
  }
}
