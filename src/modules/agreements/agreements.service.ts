import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AgreementStatus, AssignmentStatus, PortalRole, PropertyStatus, RenewalStatus, RentStatus, TenancyStatus } from '../../common/enums';
import { isFirstDayOfMonth, monthKey, toIsoDate } from '../../common/utils/dates.util';
import { assertAllowedUpload } from '../../common/utils/files.util';
import { compareAmounts, zeroAmount } from '../../common/utils/money.util';
import { AgreementRenewal, ManagerAssignment, ManagerAssignmentProperty, Property, RentObligation, Tenancy, TenancyAgreement, User } from '../../database/entities';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { JobsService } from '../jobs/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { uploadLimitBytes, StorageService } from '../storage/storage.service';
import { calculateRenewalExpiry, withinFinalMonths } from './renewal.rules';

@Injectable()
export class AgreementsService implements OnModuleInit {
  constructor(
    @InjectRepository(TenancyAgreement) private readonly agreements: Repository<TenancyAgreement>,
    @InjectRepository(AgreementRenewal) private readonly renewals: Repository<AgreementRenewal>,
    @InjectRepository(Tenancy) private readonly tenancies: Repository<Tenancy>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(ManagerAssignment) private readonly assignments: Repository<ManagerAssignment>,
    @InjectRepository(ManagerAssignmentProperty) private readonly assignmentLinks: Repository<ManagerAssignmentProperty>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly jobs: JobsService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.jobs.register('agreement.scan', async () => this.scanExpiry());
  }

  async create(userId: string, role: PortalRole | null, tenancyId: string, input: {
    startDate: string;
    expiryDate: string;
    monthlyRent: string;
    currencyCode?: string;
    securityDeposit?: string;
    rentDueDay: number;
    renewalTerms?: string;
    additionalTerms?: string;
    documentStorageKey?: string;
  }, file?: Express.Multer.File) {
    const tenancy = await this.managedTenancy(userId, role, tenancyId);
    if (input.rentDueDay < 1 || input.rentDueDay > 28) {
      throw new BadRequestException('Rent due day must be between 1 and 28');
    }
    const previous = await this.agreements.find({
      where: { tenancyId, status: AgreementStatus.ACTIVE },
      order: { version: 'DESC' },
    });
    const latest = previous[0];
    if (previous.length) {
      await this.agreements.update({ tenancyId, status: AgreementStatus.ACTIVE }, { status: AgreementStatus.SUPERSEDED });
    }
    const stored = file?.buffer?.length ? await this.storage.keep({ file }) : null;
    const version = (await this.agreements.count({ where: { tenancyId } })) + 1;
    const agreement = await this.agreements.save(this.agreements.create({
      ...input,
      tenancyId,
      propertyId: tenancy.propertyId,
      version,
      status: AgreementStatus.ACTIVE,
      currencyCode: input.currencyCode || tenancy.currencyCode,
      securityDeposit: input.securityDeposit || latest?.securityDeposit || '0.00',
      renewalTerms: input.renewalTerms ?? latest?.renewalTerms,
      additionalTerms: input.additionalTerms ?? latest?.additionalTerms,
      documentStorageKey: stored?.storageKey || input.documentStorageKey,
      fileOriginalName: stored?.originalName ?? null,
      fileMimeType: stored?.mimeType ?? null,
      fileSizeBytes: stored?.size ?? null,
      createdByUserId: userId,
    }));
    await this.tenancies.update({ id: tenancyId }, { endDate: agreement.expiryDate, monthlyRent: agreement.monthlyRent });
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'agreement.created',
      entityType: 'agreement',
      entityId: agreement.id,
      propertyId: tenancy.propertyId,
      tenancyId,
    });
    return this.present(agreement, await this.users.findOne({ where: { id: userId } }));
  }

  async extract(userId: string, role: PortalRole | null, tenancyId: string, file?: Express.Multer.File) {
    await this.managedTenancy(userId, role, tenancyId);
    if (!file?.buffer?.length) throw new BadRequestException('A PDF or image of the agreement is required');
    try {
      assertAllowedUpload(file.mimetype, file.size, uploadLimitBytes(this.config));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Unsupported file type');
    }
    const configured = Boolean(this.config.get('AI_API_KEY') && this.config.get('AI_BASE_URL'));
    return {
      configured,
      startDate: null,
      expiryDate: null,
      monthlyRent: null,
      securityDeposit: null,
      rentDueDay: null,
      renewalTerms: null,
      additionalTerms: null,
      note: configured
        ? 'The file was received. Extracted values stay empty until a provider test succeeds.'
        : 'AI extraction is not configured. Enter the agreement fields yourself.',
    };
  }

  async listForTenancy(userId: string, role: PortalRole | null, tenancyId: string) {
    const tenancy = await this.tenancies.findOne({ where: { id: tenancyId } });
    if (!tenancy) throw new NotFoundException('Tenancy was not found');
    await this.access.assertProperty(userId, role, tenancy.propertyId);
    if (role === PortalRole.TENANT && tenancy.tenantUserId !== userId) {
      throw new BadRequestException('You cannot access these agreements');
    }
    if (role === PortalRole.MANAGER) {
      await this.access.assertPermission(userId, role, tenancy.propertyId, 'DOCUMENT_VIEW', tenancy.id);
    }
    const rows = await this.agreements.find({ where: { tenancyId }, order: { version: 'DESC' } });
    return this.withUploaders(rows);
  }

  async expiring(userId: string, role: PortalRole | null) {
    const today = toIsoDate(new Date());
    const horizon = new Date(`${today}T00:00:00.000Z`);
    horizon.setUTCDate(horizon.getUTCDate() + 62);
    const until = toIsoDate(horizon);
    const rows = await this.agreements.find({
      where: { status: AgreementStatus.ACTIVE },
      order: { expiryDate: 'ASC' },
    });
    const visible = [];
    for (const row of rows) {
      if (row.expiryDate < today || row.expiryDate > until) continue;
      const tenancy = await this.tenancies.findOne({ where: { id: row.tenancyId } });
      if (!tenancy) continue;
      try {
        await this.access.assertProperty(userId, role, tenancy.propertyId);
      } catch {
        continue;
      }
      if (role === PortalRole.TENANT && tenancy.tenantUserId !== userId) continue;
      const property = await this.properties.findOne({ where: { id: row.propertyId } });
      const uploader = row.createdByUserId
        ? await this.users.findOne({ where: { id: row.createdByUserId } })
        : null;
      const tenant = tenancy.tenantUserId
        ? await this.users.findOne({ where: { id: tenancy.tenantUserId } })
        : null;
      visible.push({
        ...this.present(row, uploader),
        propertyCode: property?.visibleCode ?? null,
        propertyName: property?.name ?? null,
        tenancy: {
          id: tenancy.id,
          status: tenancy.status,
          startDate: tenancy.startDate,
          endDate: row.expiryDate,
        },
        property: property
          ? {
              id: property.id,
              visibleCode: property.visibleCode,
              name: property.name,
              status: property.status,
            }
          : null,
        tenant: tenant
          ? { firstName: tenant.firstName, lastName: tenant.lastName, email: tenant.email }
          : null,
      });
    }
    return visible;
  }

  async renewTenancy(
    userId: string,
    role: PortalRole | null,
    tenancyId: string,
    input: { years?: number; endDate?: string; monthlyRent?: string },
    file?: Express.Multer.File,
  ) {
    const hasYears = input.years != null && !Number.isNaN(input.years);
    const hasEnd = Boolean(input.endDate);
    if (hasYears === hasEnd) throw new BadRequestException('Send years or endDate');
    const current = await this.agreements.findOne({
      where: { tenancyId, status: AgreementStatus.ACTIVE },
      order: { version: 'DESC' },
    });
    if (!current) throw new NotFoundException('Active agreement was not found');
    return this.renew(userId, role, current.id, {
      years: hasYears ? input.years : undefined,
      customEndDate: hasEnd ? input.endDate : undefined,
      monthlyRent: input.monthlyRent,
    }, file);
  }

  async renew(
    userId: string,
    role: PortalRole | null,
    agreementId: string,
    input: { years?: number; customEndDate?: string; documentStorageKey?: string; monthlyRent?: string },
    file?: Express.Multer.File,
  ) {
    const current = await this.agreements.findOne({ where: { id: agreementId } });
    if (!current || current.status !== AgreementStatus.ACTIVE) {
      throw new NotFoundException('Active agreement was not found');
    }
    await this.access.assertPermission(userId, role, current.propertyId, 'AGREEMENT_MANAGE', current.tenancyId);
    if (input.monthlyRent && compareAmounts(input.monthlyRent, zeroAmount(current.currencyCode), current.currencyCode) <= 0) {
      throw new BadRequestException('Monthly rent must be greater than zero');
    }
    let expiry: Date;
    try {
      expiry = calculateRenewalExpiry({
        currentExpiry: new Date(`${current.expiryDate}T00:00:00.000Z`),
        years: input.years,
        customEndDate: input.customEndDate,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      throw new BadRequestException(code === 'CUSTOM_END_DATE_INVALID'
        ? 'The end date must be after the current expiry'
        : 'Choose a term from 1 to 30 years, or an end date');
    }
    const stored = file?.buffer?.length ? await this.storage.keep({ file }) : null;
    const created = await this.dataSource.transaction(async (manager) => {
      await manager.update(TenancyAgreement, { id: current.id }, { status: AgreementStatus.SUPERSEDED });
      const next = await manager.save(manager.create(TenancyAgreement, {
        ...current,
        id: undefined,
        version: current.version + 1,
        status: AgreementStatus.ACTIVE,
        startDate: current.expiryDate,
        expiryDate: toIsoDate(expiry),
        monthlyRent: input.monthlyRent || current.monthlyRent,
        documentStorageKey: stored?.storageKey || input.documentStorageKey || current.documentStorageKey,
        fileOriginalName: stored?.originalName || current.fileOriginalName,
        fileMimeType: stored?.mimeType || current.fileMimeType,
        fileSizeBytes: stored?.size || current.fileSizeBytes,
        createdByUserId: userId,
        createdAt: undefined,
      }));
      await manager.save(manager.create(AgreementRenewal, {
        tenancyId: current.tenancyId,
        previousAgreementId: current.id,
        newAgreementId: next.id,
        years: input.years,
        newExpiryDate: next.expiryDate,
        status: RenewalStatus.ACTIVE,
        documentStorageKey: stored?.storageKey || input.documentStorageKey,
        createdByUserId: userId,
      }));
      return next;
    });
    await this.notifyParties(current.tenancyId, current.propertyId, false, {
      type: 'agreement.renewed',
      title: 'Agreement renewed',
      body: `The agreement now expires on ${created.expiryDate}.`,
      dedupeParts: ['renewal', created.id],
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'agreement.renewed',
      entityType: 'agreement',
      entityId: created.id,
      propertyId: current.propertyId,
      tenancyId: current.tenancyId,
    });
    await this.tenancies.update({ id: current.tenancyId }, { endDate: created.expiryDate, monthlyRent: created.monthlyRent });
    return { agreement: this.present(created, await this.users.findOne({ where: { id: userId } })), previousAgreementId: current.id };
  }

  async adjustRent(
    userId: string,
    role: PortalRole | null,
    agreementId: string,
    input: { monthlyRent: string; effectiveDate: string; reason: string },
  ) {
    const current = await this.agreements.findOne({ where: { id: agreementId } });
    if (!current || current.status !== AgreementStatus.ACTIVE) {
      throw new NotFoundException('Active agreement was not found');
    }
    await this.access.assertPermission(userId, role, current.propertyId, 'AGREEMENT_MANAGE', current.tenancyId);
    const effectiveDate = input.effectiveDate.slice(0, 10);
    if (effectiveDate < current.startDate || effectiveDate > current.expiryDate) {
      throw new BadRequestException('The effective date must fall inside the agreement');
    }
    if (compareAmounts(input.monthlyRent, zeroAmount(current.currencyCode), current.currencyCode) <= 0) {
      throw new BadRequestException('Monthly rent must be greater than zero');
    }
    if (compareAmounts(input.monthlyRent, current.monthlyRent, current.currencyCode) === 0) {
      throw new BadRequestException('The new rent matches the current agreement');
    }
    const openStatuses = [RentStatus.UPCOMING, RentStatus.DUE, RentStatus.OVERDUE];
    const created = await this.dataSource.transaction(async (manager) => {
      await manager.update(TenancyAgreement, { id: current.id }, { status: AgreementStatus.SUPERSEDED });
      const next = await manager.save(manager.create(TenancyAgreement, {
        ...current,
        id: undefined,
        version: current.version + 1,
        status: AgreementStatus.ACTIVE,
        monthlyRent: input.monthlyRent,
        additionalTerms: [current.additionalTerms, `Rent set to ${input.monthlyRent} from ${effectiveDate}. ${input.reason}`]
          .filter(Boolean)
          .join('\n'),
        createdByUserId: userId,
        createdAt: undefined,
      }));
      const updated = await manager
        .createQueryBuilder()
        .update(RentObligation)
        .set({ amount: input.monthlyRent, agreementId: next.id })
        .where('tenancyId = :tenancyId', { tenancyId: current.tenancyId })
        .andWhere('dueDate >= :effectiveDate', { effectiveDate })
        .andWhere('status IN (:...openStatuses)', { openStatuses })
        .execute();
      return { agreement: next, obligationsUpdated: updated.affected || 0 };
    });
    const tenancy = await this.tenancies.findOne({ where: { id: current.tenancyId } });
    if (tenancy?.tenantUserId) {
      await this.notifications.notify({
        userId: tenancy.tenantUserId,
        type: 'agreement.rent_adjusted',
        title: 'Rent updated',
        body: `Monthly rent becomes ${input.monthlyRent} ${current.currencyCode} from ${effectiveDate}.`,
        dedupeParts: ['rent-adjustment', created.agreement.id],
      });
    }
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'agreement.rent_adjusted',
      entityType: 'agreement',
      entityId: created.agreement.id,
      propertyId: current.propertyId,
      tenancyId: current.tenancyId,
      metadata: { effectiveDate, monthlyRent: input.monthlyRent, reason: input.reason },
    });
    return {
      agreement: created.agreement,
      previousAgreementId: current.id,
      effectiveDate,
      reason: input.reason,
      obligationsUpdated: created.obligationsUpdated,
    };
  }

  async history(userId: string, role: PortalRole | null, tenancyId: string) {
    await this.listForTenancy(userId, role, tenancyId);
    return this.renewals.find({ where: { tenancyId }, order: { createdAt: 'ASC' } });
  }

  private async scanExpiry() {
    const active = await this.agreements.find({ where: { status: AgreementStatus.ACTIVE } });
    const now = new Date();
    for (const agreement of active) {
      const today = toIsoDate(now);
      if (agreement.expiryDate < today) {
        await this.agreements.update({ id: agreement.id }, { status: AgreementStatus.EXPIRED });
        const stillActive = await this.agreements.count({
          where: { tenancyId: agreement.tenancyId, status: AgreementStatus.ACTIVE },
        });
        if (!stillActive) {
          const tenancy = await this.tenancies.findOne({ where: { id: agreement.tenancyId } });
          if (tenancy?.status === TenancyStatus.ACTIVE) {
            await this.tenancies.update({ id: tenancy.id }, { status: TenancyStatus.COMPLETED });
            const others = await this.tenancies.count({
              where: { propertyId: agreement.propertyId, status: TenancyStatus.ACTIVE },
            });
            if (!others) {
              await this.properties.update({ id: agreement.propertyId }, { status: PropertyStatus.VACANT });
            }
          }
        }
        continue;
      }
      const expiry = new Date(`${agreement.expiryDate}T00:00:00.000Z`);
      const property = await this.properties.findOne({ where: { id: agreement.propertyId } });
      const timezone = property?.timezone || 'UTC';
      if (!withinFinalMonths(expiry, now) || !isFirstDayOfMonth(now, timezone)) continue;
      await this.notifyParties(agreement.tenancyId, agreement.propertyId, true, {
        type: 'agreement.expiry',
        title: 'Agreement expiry reminder',
        body: `Agreement for ${property?.visibleCode || 'a property'} expires on ${agreement.expiryDate}.`,
        dedupeParts: [agreement.id, monthKey(now, timezone)],
      });
    }
    const tomorrow = this.jobs.nextDay(now);
    await this.jobs.enqueue('agreement.scan', {}, { runAt: tomorrow, dedupeKey: `agreement.scan:${toIsoDate(tomorrow)}` });
  }

  async download(userId: string, role: PortalRole | null, id: string) {
    const agreement = await this.agreements.findOne({ where: { id } });
    if (!agreement?.documentStorageKey) throw new NotFoundException('Agreement file was not found');
    await this.listForTenancy(userId, role, agreement.tenancyId);
    return this.storage.deliver(
      agreement.documentStorageKey,
      agreement.fileMimeType || 'application/octet-stream',
      agreement.fileOriginalName || 'agreement',
      false,
    );
  }

  private async withUploaders(rows: TenancyAgreement[]) {
    const ids = [...new Set(rows.map((row) => row.createdByUserId))];
    const users = ids.length ? await this.users.find({ where: { id: In(ids) } }) : [];
    return rows.map((row) => this.present(row, users.find((user) => user.id === row.createdByUserId)));
  }

  private uploader(uploader?: User | null) {
    const firstName = uploader?.firstName ?? null;
    const lastName = uploader?.lastName ?? null;
    const displayName = [firstName, lastName].filter(Boolean).join(' ') || null;
    return { firstName, lastName, displayName };
  }

  private fileFields(row: TenancyAgreement) {
    if (!row.documentStorageKey) {
      return { originalName: null, mimeType: null, sizeBytes: null, downloadUrl: null, downloadPath: null, file: null };
    }
    const originalName = row.fileOriginalName || 'agreement';
    const mimeType = row.fileMimeType || 'application/octet-stream';
    const sizeBytes = row.fileSizeBytes ?? null;
    const downloadPath = `/api/v1/agreements/${row.id}/download`;
    const downloadUrl = this.storage.publicUrl(`agreements/${row.id}/download`);
    return {
      originalName,
      mimeType,
      sizeBytes,
      downloadUrl,
      downloadPath,
      file: { originalName, mimeType, sizeBytes, downloadPath, downloadUrl },
    };
  }

  private present(row: TenancyAgreement, uploader?: User | null) {
    return {
      id: row.id,
      tenancyId: row.tenancyId,
      propertyId: row.propertyId,
      version: row.version,
      status: row.status,
      kind: row.version <= 1 ? 'ORIGINAL' : 'RENEWAL',
      startDate: row.startDate,
      expiryDate: row.expiryDate,
      monthlyRent: row.monthlyRent,
      currencyCode: row.currencyCode,
      securityDeposit: row.securityDeposit,
      rentDueDay: row.rentDueDay,
      renewalTerms: row.renewalTerms ?? null,
      additionalTerms: row.additionalTerms ?? null,
      createdAt: row.createdAt,
      uploadedBy: this.uploader(uploader),
      ...this.fileFields(row),
    };
  }

  private async notifyParties(
    tenancyId: string,
    propertyId: string,
    includeOwner: boolean,
    input: { type: string; title: string; body: string; dedupeParts: Array<string | number> },
  ) {
    const tenancy = await this.tenancies.findOne({ where: { id: tenancyId } });
    const userIds = new Set<string>();
    if (includeOwner && tenancy?.ownerUserId) userIds.add(tenancy.ownerUserId);
    if (tenancy?.tenantUserId) userIds.add(tenancy.tenantUserId);
    const links = await this.assignmentLinks.find({ where: { propertyId } });
    if (links.length) {
      const assignments = await this.assignments.find({
        where: { id: In(links.map((link) => link.assignmentId)), status: AssignmentStatus.ACTIVE },
      });
      for (const assignment of assignments) userIds.add(assignment.managerUserId);
    }
    for (const userId of userIds) {
      await this.notifications.notify({ ...input, userId });
    }
  }

  private async managedTenancy(userId: string, role: PortalRole | null, tenancyId: string) {
    const tenancy = await this.tenancies.findOne({ where: { id: tenancyId } });
    if (!tenancy) throw new NotFoundException('Tenancy was not found');
    await this.access.assertPermission(userId, role, tenancy.propertyId, 'AGREEMENT_MANAGE', tenancy.id);
    return tenancy;
  }
}
