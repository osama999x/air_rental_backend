import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AgreementStatus, PortalRole, RenewalStatus, RentStatus } from '../../common/enums';
import { isFirstDayOfMonth, monthKey, toIsoDate } from '../../common/utils/dates.util';
import { compareAmounts, zeroAmount } from '../../common/utils/money.util';
import { AgreementRenewal, Property, RentObligation, Tenancy, TenancyAgreement } from '../../database/entities';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { JobsService } from '../jobs/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { calculateRenewalExpiry, withinFinalMonths } from './renewal.rules';
import { OnModuleInit } from '@nestjs/common';

@Injectable()
export class AgreementsService implements OnModuleInit {
  constructor(
    @InjectRepository(TenancyAgreement) private readonly agreements: Repository<TenancyAgreement>,
    @InjectRepository(AgreementRenewal) private readonly renewals: Repository<AgreementRenewal>,
    @InjectRepository(Tenancy) private readonly tenancies: Repository<Tenancy>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    private readonly dataSource: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly jobs: JobsService,
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
  }) {
    const tenancy = await this.managedTenancy(userId, role, tenancyId);
    if (input.rentDueDay < 1 || input.rentDueDay > 28) {
      throw new BadRequestException('Rent due day must be between 1 and 28');
    }
    const version = (await this.agreements.count({ where: { tenancyId } })) + 1;
    const agreement = await this.agreements.save(this.agreements.create({
      ...input,
      tenancyId,
      propertyId: tenancy.propertyId,
      version,
      status: AgreementStatus.ACTIVE,
      currencyCode: input.currencyCode || tenancy.currencyCode,
      securityDeposit: input.securityDeposit || '0.00',
      createdByUserId: userId,
    }));
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
    return agreement;
  }

  async listForTenancy(userId: string, role: PortalRole | null, tenancyId: string) {
    const tenancy = await this.tenancies.findOne({ where: { id: tenancyId } });
    if (!tenancy) throw new NotFoundException('Tenancy was not found');
    await this.access.assertProperty(userId, role, tenancy.propertyId);
    if (role === PortalRole.TENANT && tenancy.tenantUserId !== userId) {
      throw new BadRequestException('You cannot access these agreements');
    }
    return this.agreements.find({ where: { tenancyId }, order: { version: 'DESC' } });
  }

  async renew(userId: string, role: PortalRole | null, agreementId: string, input: { years?: number; customEndDate?: string; documentStorageKey?: string }) {
    const current = await this.agreements.findOne({ where: { id: agreementId } });
    if (!current || current.status !== AgreementStatus.ACTIVE) {
      throw new NotFoundException('Active agreement was not found');
    }
    await this.access.assertPermission(userId, role, current.propertyId, 'AGREEMENT_MANAGE', current.tenancyId);
    const expiry = calculateRenewalExpiry({
      currentExpiry: new Date(`${current.expiryDate}T00:00:00.000Z`),
      years: input.years,
      customEndDate: input.customEndDate,
    });
    const created = await this.dataSource.transaction(async (manager) => {
      await manager.update(TenancyAgreement, { id: current.id }, { status: AgreementStatus.SUPERSEDED });
      const next = await manager.save(manager.create(TenancyAgreement, {
        ...current,
        id: undefined,
        version: current.version + 1,
        status: AgreementStatus.ACTIVE,
        startDate: current.expiryDate,
        expiryDate: toIsoDate(expiry),
        documentStorageKey: input.documentStorageKey || current.documentStorageKey,
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
        documentStorageKey: input.documentStorageKey,
        createdByUserId: userId,
      }));
      return next;
    });
    if (current) {
      const tenancy = await this.tenancies.findOne({ where: { id: current.tenancyId } });
      if (tenancy?.tenantUserId) {
        await this.notifications.notify({
          userId: tenancy.tenantUserId,
          type: 'agreement.renewed',
          title: 'Agreement renewed',
          body: `The agreement now expires on ${created.expiryDate}.`,
          dedupeParts: ['renewal', created.id],
        });
      }
    }
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
    return { agreement: created, previousAgreementId: current.id };
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
      const expiry = new Date(`${agreement.expiryDate}T00:00:00.000Z`);
      const property = await this.properties.findOne({ where: { id: agreement.propertyId } });
      const timezone = property?.timezone || 'UTC';
      if (!withinFinalMonths(expiry, now) || !isFirstDayOfMonth(now, timezone)) continue;
      await this.notifications.notify({
        userId: property?.ownerUserId || agreement.createdByUserId,
        type: 'agreement.expiry',
        title: 'Agreement expiry reminder',
        body: `Agreement for ${property?.visibleCode || 'a property'} expires on ${agreement.expiryDate}.`,
        dedupeParts: [agreement.id, monthKey(now, timezone)],
      });
    }
    const tomorrow = this.jobs.nextDay(now);
    await this.jobs.enqueue('agreement.scan', {}, { runAt: tomorrow, dedupeKey: `agreement.scan:${toIsoDate(tomorrow)}` });
  }

  private async managedTenancy(userId: string, role: PortalRole | null, tenancyId: string) {
    const tenancy = await this.tenancies.findOne({ where: { id: tenancyId } });
    if (!tenancy) throw new NotFoundException('Tenancy was not found');
    await this.access.assertPermission(userId, role, tenancy.propertyId, 'AGREEMENT_MANAGE', tenancy.id);
    return tenancy;
  }
}
