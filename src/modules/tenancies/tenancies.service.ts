import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  InvitationStatus,
  ParticipantSide,
  PortalRole,
  PropertyStatus,
  TenancyStatus,
} from '../../common/enums';
import { normalizeEmail } from '../../common/utils/email.util';
import { addDays } from '../../common/utils/dates.util';
import { randomToken, sha256 } from '../../common/utils/tokens.util';
import {
  ChatParticipant,
  ChatThread,
  InsurancePolicy,
  Invitation,
  Property,
  Tenancy,
  TenancyParticipant,
  User,
} from '../../database/entities';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { JobsService } from '../jobs/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConfigService } from '@nestjs/config';
import { VerificationStatus } from '../../common/enums';

@Injectable()
export class TenanciesService implements OnModuleInit {
  constructor(
    @InjectRepository(Tenancy) private readonly tenancies: Repository<Tenancy>,
    @InjectRepository(Invitation) private readonly invitations: Repository<Invitation>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(InsurancePolicy) private readonly policies: Repository<InsurancePolicy>,
    private readonly dataSource: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly jobs: JobsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.jobs.register('invitation.scan', async () => {
      const pending = await this.invitations.find({ where: { status: InvitationStatus.PENDING } });
      for (const invitation of pending) {
        if (invitation.expiresAt < new Date()) {
          await this.invitations.update({ id: invitation.id }, { status: InvitationStatus.EXPIRED });
        }
      }
      const tomorrow = this.jobs.nextDay();
      await this.jobs.enqueue('invitation.scan', {}, {
        runAt: tomorrow,
        dedupeKey: `invitation.scan:${tomorrow.toISOString().slice(0, 10)}`,
      });
    });
  }

  async create(userId: string, role: PortalRole | null, input: {
    propertyId: string;
    startDate: string;
    endDate?: string;
    currencyCode?: string;
    tenantOrganizationId?: string;
  }) {
    await this.access.assertPermission(userId, role, input.propertyId, 'TENANCY_MANAGE');
    const property = await this.properties.findOne({ where: { id: input.propertyId } });
    if (!property) throw new NotFoundException('Property was not found');
    const active = await this.tenancies.findOne({
      where: { propertyId: input.propertyId, status: TenancyStatus.ACTIVE },
    });
    if (active) throw new BadRequestException('This property already has an active tenancy');
    const tenancy = await this.tenancies.save(this.tenancies.create({
      propertyId: property.id,
      ownerUserId: property.ownerUserId,
      status: TenancyStatus.PROPOSED,
      startDate: input.startDate,
      endDate: input.endDate,
      currencyCode: input.currencyCode || property.currencyCode,
      tenantOrganizationId: input.tenantOrganizationId,
    }));
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'tenancy.proposed',
      entityType: 'tenancy',
      entityId: tenancy.id,
      propertyId: property.id,
      tenancyId: tenancy.id,
    });
    return tenancy;
  }

  async invite(userId: string, role: PortalRole | null, tenancyId: string, input: { email?: string; phone?: string; expiresInDays?: number }) {
    const tenancy = await this.requireManage(userId, role, tenancyId);
    if (!input.email && !input.phone) throw new BadRequestException('An email or phone is required');
    const raw = randomToken(32);
    const invitation = await this.invitations.save(this.invitations.create({
      tenancyId,
      email: input.email ? normalizeEmail(input.email) : null,
      phone: input.phone,
      tokenHash: sha256(raw),
      status: InvitationStatus.PENDING,
      expiresAt: addDays(new Date(), input.expiresInDays || 7),
      createdByUserId: userId,
    }));
    await this.tenancies.update({ id: tenancyId }, { status: TenancyStatus.INVITED });
    const url = `${this.config.get('APP_PUBLIC_URL') || 'http://localhost:3000'}/invitations/${raw}`;
    if (input.email) {
      const existing = await this.users.findOne({ where: { email: normalizeEmail(input.email) } });
      if (existing) {
        await this.notifications.notify({
          userId: existing.id,
          type: 'tenancy.invitation',
          title: 'Tenancy invitation',
          body: 'You have a property invitation to review.',
          dedupeParts: ['invitation', invitation.id],
          data: { tenancyId },
        });
      }
    }
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'tenancy.invited',
      entityType: 'invitation',
      entityId: invitation.id,
      propertyId: tenancy.propertyId,
      tenancyId,
    });
    return { invitationId: invitation.id, expiresAt: invitation.expiresAt, url };
  }

  async preview(token: string) {
    const invitation = await this.byToken(token);
    const tenancy = await this.tenancies.findOne({ where: { id: invitation.tenancyId } });
    const property = tenancy ? await this.properties.findOne({ where: { id: tenancy.propertyId } }) : null;
    return {
      status: this.effectiveStatus(invitation),
      propertyCode: property?.visibleCode,
      propertyName: property?.name,
      startDate: tenancy?.startDate,
      endDate: tenancy?.endDate,
    };
  }

  async respond(user: User, token: string, accept: boolean) {
    const invitation = await this.byToken(token);
    if (this.effectiveStatus(invitation) !== InvitationStatus.PENDING) {
      throw new BadRequestException('This invitation is no longer open');
    }
    if (invitation.email && normalizeEmail(invitation.email) !== user.email) {
      throw new ForbiddenException('This invitation was issued to a different email');
    }
    if (!accept) {
      await this.invitations.update({ id: invitation.id }, { status: InvitationStatus.DECLINED });
      await this.tenancies.update({ id: invitation.tenancyId }, { status: TenancyStatus.DECLINED });
      return { status: InvitationStatus.DECLINED };
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Invitation, { id: invitation.id }, {
        status: InvitationStatus.ACCEPTED,
        acceptedByUserId: user.id,
      });
      await manager.update(Tenancy, { id: invitation.tenancyId }, {
        tenantUserId: user.id,
        status: TenancyStatus.ACCEPTED,
      });
      const thread = await manager.save(manager.create(ChatThread, { tenancyId: invitation.tenancyId }));
      const tenancy = await manager.findOne(Tenancy, { where: { id: invitation.tenancyId } });
      await manager.update(Tenancy, { id: invitation.tenancyId }, { chatThreadId: thread.id });
      const participants = [
        { threadId: thread.id, userId: tenancy.ownerUserId, side: ParticipantSide.OWNER },
        { threadId: thread.id, userId: user.id, side: ParticipantSide.TENANT },
      ];
      for (const participant of participants) {
        await manager.save(manager.create(ChatParticipant, participant));
        await manager.save(manager.create(TenancyParticipant, {
          tenancyId: invitation.tenancyId,
          userId: participant.userId,
          side: participant.side,
        }));
      }
    });
    await this.audit.record({
      actorUserId: user.id,
      actorType: 'USER',
      action: 'tenancy.invitation_accepted',
      entityType: 'invitation',
      entityId: invitation.id,
      tenancyId: invitation.tenancyId,
    });
    return { status: InvitationStatus.ACCEPTED, tenancyId: invitation.tenancyId };
  }

  async activate(userId: string, role: PortalRole | null, tenancyId: string) {
    const tenancy = await this.requireManage(userId, role, tenancyId);
    if (![TenancyStatus.ACCEPTED, TenancyStatus.PROPOSED].includes(tenancy.status) || !tenancy.tenantUserId) {
      throw new BadRequestException('The tenant must accept the invitation before activation');
    }
    const property = await this.properties.findOne({ where: { id: tenancy.propertyId } });
    if (property?.tenantInsuranceRequired) {
      const policy = await this.policies.findOne({
        where: { tenancyId, holderRole: 'TENANT' as any, status: VerificationStatus.VERIFIED },
      });
      if (!policy || policy.endDate < new Date().toISOString().slice(0, 10)) {
        throw new BadRequestException('A valid tenant insurance document is required before activation');
      }
    }
    await this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(Tenancy, {
        where: { propertyId: tenancy.propertyId, status: TenancyStatus.ACTIVE },
        lock: { mode: 'pessimistic_write' },
      });
      if (current && current.id !== tenancyId) {
        throw new BadRequestException('This property already has an active tenancy');
      }
      await manager.update(Tenancy, { id: tenancyId }, { status: TenancyStatus.ACTIVE });
      await manager.update(Property, { id: tenancy.propertyId }, { status: PropertyStatus.RENTED });
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'tenancy.activated',
      entityType: 'tenancy',
      entityId: tenancyId,
      propertyId: tenancy.propertyId,
      tenancyId,
    });
    return this.tenancies.findOne({ where: { id: tenancyId } });
  }

  async close(userId: string, role: PortalRole | null, tenancyId: string, status: TenancyStatus.TERMINATED | TenancyStatus.COMPLETED) {
    const tenancy = await this.requireManage(userId, role, tenancyId);
    await this.tenancies.update({ id: tenancyId }, { status });
    const stillActive = await this.tenancies.count({
      where: { propertyId: tenancy.propertyId, status: TenancyStatus.ACTIVE },
    });
    if (!stillActive) {
      await this.properties.update({ id: tenancy.propertyId }, { status: PropertyStatus.VACANT });
    }
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: `tenancy.${status.toLowerCase()}`,
      entityType: 'tenancy',
      entityId: tenancyId,
      propertyId: tenancy.propertyId,
      tenancyId,
    });
    return this.tenancies.findOne({ where: { id: tenancyId } });
  }

  async list(userId: string, role: PortalRole | null) {
    const actor = await this.access.actor(userId, role);
    if (role === PortalRole.TENANT) {
      if (!actor.tenantTenancyIds.length) return [];
      return this.tenancies.find({ where: { id: In(actor.tenantTenancyIds) } });
    }
    if (role === PortalRole.OWNER) {
      if (!actor.ownedPropertyIds.length) return [];
      return this.tenancies.createQueryBuilder('tenancy')
        .where('tenancy.propertyId IN (:...ids)', { ids: actor.ownedPropertyIds })
        .orderBy('tenancy.createdAt', 'DESC')
        .getMany();
    }
    const propertyIds = actor.assignments.filter((item) => item.status === 'ACTIVE').flatMap((item) => item.propertyIds);
    if (!propertyIds.length) return [];
    return this.tenancies.createQueryBuilder('tenancy')
      .where('tenancy.propertyId IN (:...ids)', { ids: propertyIds })
      .getMany();
  }

  async get(userId: string, role: PortalRole | null, id: string) {
    const tenancy = await this.tenancies.findOne({ where: { id } });
    if (!tenancy) throw new NotFoundException('Tenancy was not found');
    await this.access.assertProperty(userId, role, tenancy.propertyId);
    if (role === PortalRole.TENANT && tenancy.tenantUserId !== userId) {
      throw new ForbiddenException('You cannot access this tenancy');
    }
    return tenancy;
  }

  private async requireManage(userId: string, role: PortalRole | null, tenancyId: string) {
    const tenancy = await this.tenancies.findOne({ where: { id: tenancyId } });
    if (!tenancy) throw new NotFoundException('Tenancy was not found');
    await this.access.assertPermission(userId, role, tenancy.propertyId, 'TENANCY_MANAGE', tenancy.id);
    return tenancy;
  }

  private async byToken(token: string) {
    const invitation = await this.invitations.findOne({ where: { tokenHash: sha256(token) } });
    if (!invitation) throw new NotFoundException('Invitation was not found');
    return invitation;
  }

  private effectiveStatus(invitation: Invitation): InvitationStatus {
    if (invitation.status === InvitationStatus.PENDING && invitation.expiresAt < new Date()) {
      return InvitationStatus.EXPIRED;
    }
    return invitation.status;
  }
}
