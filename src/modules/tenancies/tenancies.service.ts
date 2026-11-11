import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  AgreementStatus,
  InvitationChannel,
  InvitationStatus,
  MediaKind,
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
  City,
  InsurancePolicy,
  Invitation,
  OwnerProfile,
  Property,
  PropertyMedia,
  Tenancy,
  TenancyAgreement,
  TenancyParticipant,
  TenantProfile,
  User,
} from '../../database/entities';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { JobsService } from '../jobs/jobs.service';
import { MailService } from '../notifications/mail.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IdentityDocumentsService } from '../users/identity-documents.service';
import { ConfigService } from '@nestjs/config';
import { VerificationStatus } from '../../common/enums';

@Injectable()
export class TenanciesService implements OnModuleInit {
  constructor(
    @InjectRepository(Tenancy) private readonly tenancies: Repository<Tenancy>,
    @InjectRepository(Invitation) private readonly invitations: Repository<Invitation>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(PropertyMedia) private readonly media: Repository<PropertyMedia>,
    @InjectRepository(City) private readonly cities: Repository<City>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(InsurancePolicy) private readonly policies: Repository<InsurancePolicy>,
    @InjectRepository(TenancyAgreement) private readonly agreements: Repository<TenancyAgreement>,
    @InjectRepository(OwnerProfile) private readonly owners: Repository<OwnerProfile>,
    @InjectRepository(TenantProfile) private readonly tenants: Repository<TenantProfile>,
    private readonly dataSource: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly jobs: JobsService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
    private readonly auth: AuthService,
    private readonly identity: IdentityDocumentsService,
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
    monthlyRent?: string;
  }) {
    await this.access.assertPermission(userId, role, input.propertyId, 'TENANCY_MANAGE');
    const property = await this.properties.findOne({ where: { id: input.propertyId } });
    if (!property) throw new NotFoundException('Property was not found');
    const active = await this.tenancies.findOne({
      where: { propertyId: input.propertyId, status: TenancyStatus.ACTIVE },
    });
    if (active) throw new BadRequestException('This property already has an active tenancy');
    const proposed = await this.tenancies.find({
      where: { propertyId: property.id, status: TenancyStatus.PROPOSED },
      order: { createdAt: 'DESC' },
    });
    if (proposed.length) {
      const [current, ...older] = proposed;
      current.startDate = input.startDate;
      current.endDate = input.endDate ?? null;
      if (input.currencyCode) current.currencyCode = input.currencyCode;
      if (input.tenantOrganizationId) current.tenantOrganizationId = input.tenantOrganizationId;
      if (input.monthlyRent) current.monthlyRent = input.monthlyRent;
      const saved = await this.tenancies.save(current);
      if (older.length) {
        await this.tenancies.update({ id: In(older.map((row) => row.id)) }, { status: TenancyStatus.TERMINATED });
      }
      await this.audit.record({
        actorUserId: userId,
        actorType: 'USER',
        activeRole: role,
        action: 'tenancy.proposed',
        entityType: 'tenancy',
        entityId: saved.id,
        propertyId: property.id,
        tenancyId: saved.id,
        metadata: { reused: true },
      });
      return saved;
    }
    const tenancy = await this.tenancies.save(this.tenancies.create({
      propertyId: property.id,
      ownerUserId: property.ownerUserId,
      status: TenancyStatus.PROPOSED,
      startDate: input.startDate,
      endDate: input.endDate,
      currencyCode: input.currencyCode || property.currencyCode,
      tenantOrganizationId: input.tenantOrganizationId,
      monthlyRent: input.monthlyRent || null,
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

  async invite(userId: string, role: PortalRole | null, tenancyId: string, input: {
    email?: string;
    phone?: string;
    tenantName?: string;
    channel?: InvitationChannel;
    expiresInDays?: number;
    notes?: string;
  }) {
    const tenancy = await this.requireManage(userId, role, tenancyId);
    if (![TenancyStatus.PROPOSED, TenancyStatus.INVITED, TenancyStatus.DECLINED].includes(tenancy.status)) {
      throw new BadRequestException('This tenancy cannot take another invitation');
    }
    const channel = input.channel
      ?? (input.email || input.phone ? InvitationChannel.CONTACT : InvitationChannel.LINK);
    if (channel === InvitationChannel.CONTACT && !input.email && !input.phone) {
      throw new BadRequestException('A contact invite needs an email or a phone number');
    }
    const property = await this.properties.findOne({ where: { id: tenancy.propertyId } });
    const raw = randomToken(32);
    const invitation = await this.invitations.save(this.invitations.create({
      tenancyId,
      email: input.email ? normalizeEmail(input.email) : null,
      phone: input.phone?.trim() || null,
      tenantName: input.tenantName?.trim() || null,
      notes: input.notes?.trim() || null,
      channel,
      tokenHash: sha256(raw),
      status: InvitationStatus.PENDING,
      expiresAt: addDays(new Date(), input.expiresInDays || 7),
      createdByUserId: userId,
    }));
    await this.tenancies.update({ id: tenancyId }, { status: TenancyStatus.INVITED });
    const url = this.shareUrl(raw);
    const delivery = await this.deliverInvite(channel, invitation.email, invitation.phone, url, property?.name || 'a property');
    if (invitation.email) {
      const existing = await this.users.findOne({ where: { email: invitation.email } });
      if (existing) {
        await this.notifications.notify({
          userId: existing.id,
          type: 'tenancy.invitation',
          title: 'Tenancy invitation',
          body: `You have an invitation for ${property?.name || 'a property'}.`,
          dedupeParts: ['invitation', invitation.id],
          data: { tenancyId, url },
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
      metadata: { channel },
    });
    return { invitationId: invitation.id, expiresAt: invitation.expiresAt, url, channel, delivery };
  }

  async listInvitations(userId: string, role: PortalRole | null, propertyId?: string) {
    const actor = await this.access.actor(userId, role);
    const user = await this.users.findOne({ where: { id: userId } });
    const rows = await this.invitations.find({ order: { createdAt: 'DESC' }, take: 200 });
    const visible = [];
    for (const invitation of rows) {
      if (this.effectiveStatus(invitation) !== InvitationStatus.PENDING) continue;
      const tenancy = await this.tenancies.findOne({ where: { id: invitation.tenancyId } });
      if (!tenancy) continue;
      if (propertyId && tenancy.propertyId !== propertyId) continue;
      const incoming = Boolean(user && this.addressedTo(invitation, user));
      const outgoing = this.canManageProperty(actor, role, tenancy.propertyId);
      if (!incoming && !outgoing) continue;
      const property = await this.properties.findOne({ where: { id: tenancy.propertyId } });
      visible.push({
        ...(await this.presentInvitation(invitation, tenancy, property)),
        direction: role === PortalRole.TENANT || (incoming && !outgoing) ? 'incoming' : 'outgoing',
      });
    }
    return visible;
  }

  preview(token: string) {
    return this.lookup(token);
  }

  async lookup(token: string) {
    if (!token) throw new BadRequestException('token is required');
    const invitation = await this.byToken(token);
    const tenancy = await this.tenancies.findOne({ where: { id: invitation.tenancyId } });
    const property = tenancy ? await this.properties.findOne({ where: { id: tenancy.propertyId } }) : null;
    return {
      ...(await this.presentInvitation(invitation, tenancy, property)),
      accountExists: await this.accountExists(invitation),
    };
  }

  async respond(user: User, token: string, accept: boolean) {
    return this.applyResponse(user, await this.byToken(token), accept);
  }

  async respondById(user: User, id: string, accept: boolean, token?: string) {
    const invitation = await this.invitations.findOne({ where: { id } });
    if (!invitation) throw new NotFoundException('Invitation was not found');
    if (token && invitation.tokenHash !== sha256(token)) {
      throw new ForbiddenException('This invitation link does not match');
    }
    if (!token && !this.addressedTo(invitation, user)) {
      throw new ForbiddenException('This invitation was issued to a different email');
    }
    return this.applyResponse(user, invitation, accept);
  }

  async review(user: User, id: string, message: string, token?: string) {
    const reviewMessage = message.trim();
    if (!reviewMessage) throw new BadRequestException('message is required');
    const invitation = await this.invitations.findOne({ where: { id } });
    if (!invitation) throw new NotFoundException('Invitation was not found');
    if (token && invitation.tokenHash !== sha256(token)) {
      throw new ForbiddenException('This invitation link does not match');
    }
    if (!token && !this.addressedTo(invitation, user)) {
      throw new ForbiddenException('This invitation was issued to a different email');
    }
    const status = this.effectiveStatus(invitation);
    if (status !== InvitationStatus.PENDING) throw new GoneException(this.closedMessage(status));
    if (invitation.email && normalizeEmail(invitation.email) !== user.email) {
      throw new ForbiddenException('This invitation was issued to a different email');
    }
    await this.invitations.update({ id }, { reviewMessage });
    const tenancy = await this.tenancies.findOne({ where: { id: invitation.tenancyId } });
    if (tenancy) {
      const property = await this.properties.findOne({ where: { id: tenancy.propertyId } });
      await this.notifications.notify({
        userId: tenancy.ownerUserId,
        type: 'tenancy.invitation_review',
        title: 'Invitation needs a correction',
        body: reviewMessage,
        dedupeParts: ['invitation-review', invitation.id, Date.now()],
        data: { invitationId: invitation.id, tenancyId: tenancy.id, propertyId: tenancy.propertyId },
      });
      await this.audit.record({
        actorUserId: user.id,
        actorType: 'USER',
        activeRole: PortalRole.TENANT,
        action: 'tenancy.invitation_reviewed',
        entityType: 'invitation',
        entityId: id,
        propertyId: tenancy.propertyId,
        tenancyId: tenancy.id,
        metadata: { propertyName: property?.name ?? null },
      });
    }
    return { id, status: InvitationStatus.PENDING, reviewMessage };
  }

  async revoke(userId: string, role: PortalRole | null, id: string) {
    const invitation = await this.invitations.findOne({ where: { id } });
    if (!invitation) throw new NotFoundException('Invitation was not found');
    const tenancy = await this.requireManage(userId, role, invitation.tenancyId);
    const status = this.effectiveStatus(invitation);
    if (status !== InvitationStatus.PENDING) throw new GoneException(this.closedMessage(status));
    await this.invitations.update({ id }, { status: InvitationStatus.REVOKED, revokedAt: new Date() });
    const open = await this.openInvitations(tenancy.id, id);
    if (!open.length && tenancy.status === TenancyStatus.INVITED) {
      await this.tenancies.update({ id: tenancy.id }, { status: TenancyStatus.PROPOSED });
    }
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'tenancy.invitation_revoked',
      entityType: 'invitation',
      entityId: id,
      propertyId: tenancy.propertyId,
      tenancyId: tenancy.id,
    });
    return { id, status: InvitationStatus.REVOKED };
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

  async list(userId: string, role: PortalRole | null, propertyId?: string) {
    const actor = await this.access.actor(userId, role);
    let rows: Tenancy[] = [];
    if (role === PortalRole.TENANT) {
      if (actor.tenantTenancyIds.length) {
        rows = await this.tenancies.find({ where: { id: In(actor.tenantTenancyIds) } });
      }
    } else if (role === PortalRole.OWNER) {
      if (actor.ownedPropertyIds.length) {
        rows = await this.tenancies.createQueryBuilder('tenancy')
          .where('tenancy.propertyId IN (:...ids)', { ids: actor.ownedPropertyIds })
          .orderBy('tenancy.createdAt', 'DESC')
          .getMany();
      }
    } else {
      const propertyIds = actor.assignments.filter((item) => item.status === 'ACTIVE').flatMap((item) => item.propertyIds);
      if (propertyIds.length) {
        rows = await this.tenancies.createQueryBuilder('tenancy')
          .where('tenancy.propertyId IN (:...ids)', { ids: propertyIds })
          .getMany();
      }
    }
    const visible = propertyId ? rows.filter((row) => row.propertyId === propertyId) : rows;
    if (!visible.length) return [];
    const properties = await this.properties.find({ where: { id: In(visible.map((row) => row.propertyId)) } });
    const byId = new Map(properties.map((property) => [property.id, property]));
    return visible.map((row) => ({
      ...row,
      propertyCode: byId.get(row.propertyId)?.visibleCode ?? null,
      propertyName: byId.get(row.propertyId)?.name ?? null,
    }));
  }

  async get(userId: string, role: PortalRole | null, id: string) {
    const tenancy = await this.tenancies.findOne({ where: { id } });
    if (!tenancy) throw new NotFoundException('Tenancy was not found');
    await this.access.assertProperty(userId, role, tenancy.propertyId);
    if (role === PortalRole.TENANT && tenancy.tenantUserId !== userId) {
      throw new ForbiddenException('You cannot access this tenancy');
    }
    const agreement = await this.agreements.findOne({
      where: { tenancyId: id, status: AgreementStatus.ACTIVE },
      order: { version: 'DESC' },
    });
    const money = {
      rent: agreement?.monthlyRent ?? null,
      deposit: agreement?.securityDeposit ?? null,
      currencyCode: agreement?.currencyCode ?? tenancy.currencyCode,
      agreementStart: agreement?.startDate ?? null,
      agreementEnd: agreement?.expiryDate ?? null,
    };
    if (role === PortalRole.TENANT) {
      const ownerUser = await this.users.findOne({ where: { id: tenancy.ownerUserId } });
      const ownerProfile = await this.owners.findOne({ where: { userId: tenancy.ownerUserId } });
      return {
        ...tenancy,
        ...money,
        owner: {
          userId: tenancy.ownerUserId,
          name: ownerProfile?.displayName || [ownerUser?.firstName, ownerUser?.lastName].filter(Boolean).join(' '),
        },
      };
    }
    const tenantUser = tenancy.tenantUserId
      ? await this.users.findOne({ where: { id: tenancy.tenantUserId } })
      : null;
    const tenantProfile = tenancy.tenantUserId
      ? await this.tenants.findOne({ where: { userId: tenancy.tenantUserId } })
      : null;
    return {
      ...tenancy,
      ...money,
      tenant: tenantUser
        ? {
            userId: tenantUser.id,
            name: tenantProfile?.displayName || `${tenantUser.firstName} ${tenantUser.lastName}`.trim(),
            email: tenantUser.email,
            phone: tenantUser.phone ?? null,
            emergencyContactName: tenantProfile?.emergencyContactName ?? null,
            emergencyContactPhone: tenantProfile?.emergencyContactPhone ?? null,
            emergencyContactRelationship: tenantProfile?.emergencyContactRelationship ?? null,
          }
        : null,
      identityDocuments: tenancy.tenantUserId ? await this.identity.summaryForUser(tenancy.tenantUserId) : [],
    };
  }

  private async applyResponse(user: User, invitation: Invitation, accept: boolean) {
    const status = this.effectiveStatus(invitation);
    if (status !== InvitationStatus.PENDING) throw new GoneException(this.closedMessage(status));
    if (invitation.email && normalizeEmail(invitation.email) !== user.email) {
      throw new ForbiddenException('This invitation was issued to a different email');
    }
    if (!accept) {
      await this.invitations.update({ id: invitation.id }, { status: InvitationStatus.DECLINED });
      const open = await this.openInvitations(invitation.tenancyId, invitation.id);
      if (!open.length) {
        await this.tenancies.update({ id: invitation.tenancyId }, { status: TenancyStatus.DECLINED });
      }
      return { status: InvitationStatus.DECLINED, tenancyId: invitation.tenancyId };
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Invitation, { id: invitation.id }, {
        status: InvitationStatus.ACCEPTED,
        acceptedByUserId: user.id,
      });
      await manager
        .createQueryBuilder()
        .update(Invitation)
        .set({ status: InvitationStatus.REVOKED, revokedAt: new Date() })
        .where('tenancyId = :tenancyId AND status = :status AND id != :id', {
          tenancyId: invitation.tenancyId,
          status: InvitationStatus.PENDING,
          id: invitation.id,
        })
        .execute();
      await manager.update(Tenancy, { id: invitation.tenancyId }, {
        tenantUserId: user.id,
        status: TenancyStatus.ACCEPTED,
      });
      const thread = await manager.save(manager.create(ChatThread, { tenancyId: invitation.tenancyId }));
      const tenancy = await manager.findOne(Tenancy, { where: { id: invitation.tenancyId } });
      if (!tenancy) throw new NotFoundException('Tenancy was not found');
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
    await this.auth.grantRole(user, PortalRole.TENANT);
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

  private shareUrl(token: string) {
    const origin = String(this.config.get('WEB_APP_URL') || 'http://localhost:3001')
      .trim()
      .replace(/\/+$/, '')
      .replace(/\.+$/, '');
    return `${origin}/portal/invite/${token}`;
  }

  private async deliverInvite(
    channel: InvitationChannel,
    email: string | null | undefined,
    phone: string | null | undefined,
    url: string,
    propertyName: string,
  ) {
    if (channel !== InvitationChannel.CONTACT) return { sent: false, reason: 'OWNER_SHARES_LINK' };
    if (email) {
      const result = await this.mail.send(
        email,
        'Air Rental tenancy invitation',
        `You are invited to ${propertyName}. Open ${url}`,
      );
      if (!result.delivered) return { sent: false, reason: result.reason || 'EMAIL_NOT_CONFIGURED' };
      return { sent: true, reason: null };
    }
    if (phone) return { sent: false, reason: 'SMS_NOT_CONFIGURED' };
    return { sent: false, reason: 'OWNER_SHARES_LINK' };
  }

  private async presentInvitation(
    invitation: Invitation,
    tenancy: Tenancy | null,
    property: Property | null,
  ) {
    const owner = tenancy ? await this.ownerCard(tenancy.ownerUserId) : null;
    const place = await this.propertyPlace(property);
    const agreement = tenancy
      ? await this.agreements.findOne({ where: { tenancyId: tenancy.id }, order: { version: 'DESC' } })
      : null;
    return {
      invitationId: invitation.id,
      id: invitation.id,
      tenancyId: invitation.tenancyId,
      propertyId: tenancy?.propertyId ?? null,
      propertyCode: property?.visibleCode ?? null,
      propertyName: property?.name ?? null,
      propertyType: property?.propertyType ?? null,
      propertyUnit: property?.unit ?? null,
      propertyAddress: property?.addressLine ?? null,
      propertyCity: place.city,
      propertyPhotoUrl: place.photoUrl,
      rent: agreement?.monthlyRent ?? tenancy?.monthlyRent ?? null,
      notes: invitation.notes ?? agreement?.additionalTerms ?? null,
      reviewMessage: invitation.reviewMessage ?? null,
      tenantName: invitation.tenantName ?? null,
      invitedBy: owner?.name ?? null,
      invitedByPhone: owner?.phone ?? null,
      invitedByPhotoUrl: owner?.photoUrl ?? null,
      channel: invitation.channel,
      status: this.effectiveStatus(invitation),
      expiresAt: invitation.expiresAt,
      startDate: tenancy?.startDate ?? null,
      endDate: tenancy?.endDate ?? null,
      createdAt: invitation.createdAt,
    };
  }

  private async ownerCard(userId: string) {
    const [ownerUser, ownerProfile] = await Promise.all([
      this.users.findOne({ where: { id: userId } }),
      this.owners.findOne({ where: { userId } }),
    ]);
    const name = (ownerProfile?.displayName || [ownerUser?.firstName, ownerUser?.lastName].filter(Boolean).join(' ')).trim();
    return {
      name: name || null,
      phone: ownerUser?.phone ?? null,
      photoUrl: ownerUser?.avatarStorageKey
        ? this.storage.signedPublicUrl(`public/avatars/${userId}`, `avatar:${userId}`)
        : null,
    };
  }

  private async propertyPlace(property: Property | null) {
    if (!property) return { city: null, photoUrl: null };
    const [city, photo] = await Promise.all([
      property.cityId ? this.cities.findOne({ where: { id: property.cityId } }) : Promise.resolve(null),
      this.media.findOne({ where: { propertyId: property.id, kind: MediaKind.PHOTO }, order: { createdAt: 'ASC' } }),
    ]);
    return {
      city: city?.name ?? null,
      photoUrl: photo
        ? this.storage.signedPublicUrl(`public/media/${photo.id}`, `property-media:${photo.id}`)
        : null,
    };
  }

  private async accountExists(invitation: Invitation) {
    if (invitation.email) return Boolean(await this.users.findOne({ where: { email: invitation.email } }));
    if (invitation.phone) return Boolean(await this.users.findOne({ where: { phone: invitation.phone } }));
    return false;
  }

  private addressedTo(invitation: Invitation, user: User) {
    if (invitation.email && normalizeEmail(invitation.email) === user.email) return true;
    if (invitation.phone && user.phone && this.samePhone(invitation.phone, user.phone)) return true;
    return false;
  }

  private samePhone(left: string, right: string) {
    const digits = (value: string) => value.replace(/\D/g, '');
    const a = digits(left);
    const b = digits(right);
    return Boolean(a) && (a === b || a.endsWith(b) || b.endsWith(a));
  }

  private canManageProperty(
    actor: { ownedPropertyIds: string[]; assignments: Array<{ status: string; propertyIds: string[] }> },
    role: PortalRole | null,
    propertyId: string,
  ) {
    if (role === PortalRole.TENANT) return false;
    if (actor.ownedPropertyIds.includes(propertyId)) return true;
    return actor.assignments.some((item) => item.status === 'ACTIVE' && item.propertyIds.includes(propertyId));
  }

  private closedMessage(status: InvitationStatus) {
    if (status === InvitationStatus.EXPIRED) return 'This invitation has expired';
    if (status === InvitationStatus.ACCEPTED) return 'This invitation has already been used';
    if (status === InvitationStatus.DECLINED) return 'This invitation was declined';
    if (status === InvitationStatus.REVOKED) return 'This invitation was revoked';
    return 'This invitation is no longer open';
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

  private async openInvitations(tenancyId: string, exceptId: string) {
    const rows = await this.invitations.find({ where: { tenancyId, status: InvitationStatus.PENDING } });
    return rows.filter((row) => row.id !== exceptId && this.effectiveStatus(row) === InvitationStatus.PENDING);
  }

  private effectiveStatus(invitation: Invitation): InvitationStatus {
    if (invitation.status === InvitationStatus.PENDING && invitation.expiresAt < new Date()) {
      return InvitationStatus.EXPIRED;
    }
    return invitation.status;
  }
}
