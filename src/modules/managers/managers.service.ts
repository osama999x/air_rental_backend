import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AssignmentSide, AssignmentStatus, PortalRole, TenancyStatus } from '../../common/enums';
import { APP_PERMISSION_GRANTS } from '../access/access.policy';
import { MailService } from '../notifications/mail.service';
import {
  MaintenanceRequest,
  ManagerAssignment,
  ManagerAssignmentProperty,
  Property,
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
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(MaintenanceRequest) private readonly tasks: Repository<MaintenanceRequest>,
    private readonly dataSource: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  private readonly appPermissions = Object.keys(APP_PERMISSION_GRANTS);
  private readonly tenantGrant = ['VIEW_AGREEMENTS', 'RENT', 'REPAIRS'];

  async assign(userId: string, role: PortalRole | null, input: {
    email?: string;
    managerEmail?: string;
    name?: string;
    side?: string;
    propertyIds: string[];
    permissions: string[];
  }) {
    const side = this.sideFor(role);
    const email = input.email || input.managerEmail;
    if (!email) throw new BadRequestException('An email is required');
    if (input.side && input.side !== side) throw new BadRequestException('side does not match the portal');
    this.assertPermissions(role, input.permissions);
    if (!input.propertyIds.length) throw new BadRequestException('Select at least one property');
    await this.assertProperties(userId, role, input.propertyIds);
    const invitedEmail = normalizeEmail(email);
    const manager = await this.users.findOne({ where: { email: invitedEmail } });
    const saved = await this.dataSource.transaction(async (managerDb) => {
      const assignment = await managerDb.save(managerDb.create(ManagerAssignment, {
        assigningUserId: userId,
        managerUserId: manager?.id ?? null,
        invitedEmail,
        invitedName: input.name?.trim() || null,
        side,
        status: AssignmentStatus.PENDING,
        startsAt: new Date(),
        permissions: input.permissions,
        spendLimit: null,
        tenancyId: null,
      }));
      for (const propertyId of input.propertyIds) {
        await managerDb.save(managerDb.create(ManagerAssignmentProperty, {
          assignmentId: assignment.id,
          propertyId,
        }));
      }
      return assignment;
    });
    await this.mail.send(
      invitedEmail,
      'Air Rental manager invitation',
      'You have been invited to manage properties in Air Rental. Open the app and accept the invitation.',
    );
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'manager.assigned',
      entityType: 'manager_assignment',
      entityId: saved.id,
      propertyId: input.propertyIds[0],
      metadata: { side, permissions: input.permissions.join(',') },
    });
    return this.present(saved, await this.links.find({ where: { assignmentId: saved.id } }));
  }

  async update(userId: string, role: PortalRole | null, assignmentId: string, input: {
    propertyIds: string[];
    permissions: string[];
  }) {
    const assignment = await this.ownedAssignment(userId, role, assignmentId);
    this.assertPermissions(role, input.permissions);
    if (!input.propertyIds.length) throw new BadRequestException('Select at least one property');
    await this.assertProperties(userId, role, input.propertyIds);
    assignment.permissions = input.permissions;
    await this.dataSource.transaction(async (managerDb) => {
      await managerDb.save(assignment);
      await managerDb.delete(ManagerAssignmentProperty, { assignmentId });
      for (const propertyId of input.propertyIds) {
        await managerDb.save(managerDb.create(ManagerAssignmentProperty, { assignmentId, propertyId }));
      }
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'manager.updated',
      entityType: 'manager_assignment',
      entityId: assignmentId,
      propertyId: input.propertyIds[0],
      metadata: { permissions: input.permissions.join(',') },
    });
    return this.present(assignment, await this.links.find({ where: { assignmentId } }));
  }

  async respond(userId: string, role: PortalRole | null, assignmentId: string, accept: boolean) {
    const assignment = await this.assignments.findOne({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment was not found');
    const user = await this.users.findOne({ where: { id: userId } });
    const invited = assignment.invitedEmail && user?.email && normalizeEmail(assignment.invitedEmail) === user.email;
    if (assignment.managerUserId !== userId && !invited) {
      throw new ForbiddenException('Only the assigned manager can respond');
    }
    if (assignment.status !== AssignmentStatus.PENDING) {
      throw new ConflictException('This assignment has already been answered');
    }
    if (accept) {
      const existing = await this.roles.findOne({ where: { userId, role: PortalRole.MANAGER } });
      if (!existing) {
        await this.roles.save(this.roles.create({ userId, role: PortalRole.MANAGER }));
      }
      assignment.managerUserId = userId;
    }
    assignment.status = accept ? AssignmentStatus.ACTIVE : AssignmentStatus.DECLINED;
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
    return this.present(assignment, await this.links.find({ where: { assignmentId } }));
  }

  async revoke(userId: string, role: PortalRole | null, assignmentId: string) {
    const assignment = await this.ownedAssignment(userId, role, assignmentId);
    assignment.status = AssignmentStatus.REVOKED;
    assignment.endsAt = new Date();
    await this.assignments.save(assignment);
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'manager.revoked',
      entityType: 'manager_assignment',
      entityId: assignmentId,
    });
    return this.present(assignment, await this.links.find({ where: { assignmentId } }));
  }

  async list(userId: string, role: PortalRole | null) {
    if (role === PortalRole.MANAGER) {
      const user = await this.users.findOne({ where: { id: userId } });
      const rows = await this.assignments.find({ order: { createdAt: 'DESC' } });
      const mine = rows.filter((row) => row.managerUserId === userId || (user?.email && row.invitedEmail && normalizeEmail(row.invitedEmail) === user.email));
      return this.presentMany(mine);
    }
    const side = role === PortalRole.TENANT ? AssignmentSide.TENANT : AssignmentSide.OWNER;
    const rows = await this.assignments.find({
      where: { assigningUserId: userId, side },
      order: { createdAt: 'DESC' },
    });
    return this.presentMany(rows);
  }

  async activity(userId: string, role: PortalRole | null) {
    if (role !== PortalRole.OWNER && role !== PortalRole.TENANT) {
      throw new ForbiddenException('Open this from the owner or tenant portal');
    }
    const side = role === PortalRole.TENANT ? AssignmentSide.TENANT : AssignmentSide.OWNER;
    const rows = await this.assignments.find({ where: { assigningUserId: userId, side } });
    if (!rows.length) return [];
    const links = await this.links.find({ where: { assignmentId: In(rows.map((row) => row.id)) } });
    const propertyIds = [...new Set(links.map((link) => link.propertyId))];
    return this.audit.listManagerActions(propertyIds);
  }

  async listForProperty(userId: string, role: PortalRole | null, propertyId: string) {
    await this.access.assertProperty(userId, role, propertyId);
    const links = await this.links.find({ where: { propertyId } });
    if (!links.length) return [];
    const rows = await this.assignments.find({
      where: { id: In(links.map((link) => link.assignmentId)) },
      order: { createdAt: 'DESC' },
    });
    return this.presentMany(rows);
  }

  async mine(userId: string, role: PortalRole | null) {
    if (role !== PortalRole.MANAGER) throw new ForbiddenException('Open this from the manager portal');
    const assignments = await this.assignments.find({
      where: { managerUserId: userId, status: AssignmentStatus.ACTIVE },
    });
    const links = assignments.length
      ? await this.links.find({ where: { assignmentId: In(assignments.map((row) => row.id)) } })
      : [];
    const propertyIds = [...new Set(links.map((link) => link.propertyId))];
    const properties = propertyIds.length
      ? await this.properties.find({ where: { id: In(propertyIds) } })
      : [];
    const tasks = propertyIds.length
      ? await this.tasks.find({ where: { propertyId: In(propertyIds) }, order: { createdAt: 'DESC' }, take: 100 })
      : [];
    return {
      properties: properties.map((property) => ({
        id: property.id,
        name: property.name,
        visibleCode: property.visibleCode,
        status: property.status,
      })),
      tasks: tasks.map((task) => ({
        id: task.id,
        propertyId: task.propertyId,
        tenancyId: task.tenancyId ?? null,
        status: task.status,
        category: task.category,
        description: task.description,
        createdAt: task.createdAt,
      })),
    };
  }

  private async presentMany(rows: ManagerAssignment[]) {
    if (!rows.length) return [];
    const links = await this.links.find({ where: { assignmentId: In(rows.map((row) => row.id)) } });
    return Promise.all(rows.map((row) => this.present(row, links.filter((link) => link.assignmentId === row.id))));
  }

  private async present(row: ManagerAssignment, links: ManagerAssignmentProperty[]) {
    const manager = row.managerUserId ? await this.users.findOne({ where: { id: row.managerUserId } }) : null;
    const assigner = await this.users.findOne({ where: { id: row.assigningUserId } });
    const propertyIds = links.map((link) => link.propertyId);
    const properties = propertyIds.length ? await this.properties.find({ where: { id: In(propertyIds) } }) : [];
    const invited = this.splitName(row.invitedName);
    return {
      id: row.id,
      status: row.status,
      side: row.side,
      manager: {
        email: manager?.email || row.invitedEmail || null,
        firstName: manager?.firstName || invited.firstName,
        lastName: manager?.lastName || invited.lastName,
      },
      assignedBy: {
        firstName: assigner?.firstName ?? null,
        lastName: assigner?.lastName ?? null,
      },
      properties: properties.map((property) => ({
        id: property.id,
        visibleCode: property.visibleCode,
        name: property.name,
      })),
      permissions: this.appPermissionsFor(row.permissions),
    };
  }

  private sideFor(role: PortalRole | null) {
    if (role === PortalRole.OWNER) return AssignmentSide.OWNER;
    if (role === PortalRole.TENANT) return AssignmentSide.TENANT;
    throw new ForbiddenException('Open this from the owner or tenant portal');
  }

  private assertPermissions(role: PortalRole | null, permissions: string[]) {
    if (!permissions.length) throw new BadRequestException('Select at least one permission');
    if (permissions.some((permission) => !this.appPermissions.includes(permission))) {
      throw new BadRequestException('Unknown permission');
    }
    if (role === PortalRole.TENANT && permissions.some((permission) => !this.tenantGrant.includes(permission))) {
      throw new ForbiddenException('A manager can never get more access than you have');
    }
    if (role !== PortalRole.OWNER && role !== PortalRole.TENANT) {
      throw new ForbiddenException('Open this from the owner or tenant portal');
    }
  }

  private async assertProperties(userId: string, role: PortalRole | null, propertyIds: string[]) {
    const unique = [...new Set(propertyIds)];
    if (role === PortalRole.OWNER) {
      const actor = await this.access.actor(userId, role);
      if (unique.some((id) => !actor.ownedPropertyIds.includes(id))) {
        throw new ForbiddenException('A manager can never get more access than you have');
      }
      return;
    }
    const tenancies = await this.tenancies.find({
      where: { tenantUserId: userId, status: TenancyStatus.ACTIVE, propertyId: In(unique) },
    });
    const rented = new Set(tenancies.map((tenancy) => tenancy.propertyId));
    if (unique.some((id) => !rented.has(id))) {
      throw new ForbiddenException('A manager can never get more access than you have');
    }
  }

  private async ownedAssignment(userId: string, role: PortalRole | null, assignmentId: string) {
    const assignment = await this.assignments.findOne({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment was not found');
    const side = this.sideFor(role);
    if (assignment.assigningUserId !== userId || assignment.side !== side) {
      throw new ForbiddenException('Only the person who assigned this manager can change it');
    }
    return assignment;
  }

  private splitName(name?: string | null) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    return { firstName: parts[0] || null, lastName: parts.slice(1).join(' ') || null };
  }

  private appPermissionsFor(permissions: string[]) {
    const reverse: Record<string, string> = {
      PROPERTY_VIEW: 'TENANT_DETAILS',
      PROPERTY_MANAGE: 'MANAGE_PROPERTY',
      TENANCY_MANAGE: 'INVITE_TENANTS',
      DOCUMENT_VIEW: 'VIEW_AGREEMENTS',
      AGREEMENT_MANAGE: 'MANAGE_AGREEMENTS',
      RENT_VIEW: 'RENT',
      MAINTENANCE_CREATE: 'REPAIRS',
      MAINTENANCE_REVIEW: 'REPAIRS',
      FINANCE_VIEW: 'OWNER_FINANCES',
    };
    return [...new Set(permissions.map((permission) => reverse[permission] || permission))];
  }
}
