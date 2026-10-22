import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { LedgerStatus, PortalRole, ProofStatus, RentStatus } from '../../common/enums';
import { assertAllowedUpload } from '../../common/utils/files.util';
import { toIsoDate } from '../../common/utils/dates.util';
import {
  clampRemaining,
  compareAmounts,
  zeroAmount,
} from '../../common/utils/money.util';
import {
  Property,
  RentObligation,
  RentPayment,
  RentPaymentProof,
  Tenancy,
  TenancyAgreement,
} from '../../database/entities';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { JobsService } from '../jobs/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { uploadLimitBytes, StorageService } from '../storage/storage.service';
import { confirmedIncome, deriveRentStatus } from './rent.rules';
import { buildDedupeKey } from '../notifications/notification.rules';

@Injectable()
export class RentService implements OnModuleInit {
  constructor(
    @InjectRepository(RentObligation) private readonly obligations: Repository<RentObligation>,
    @InjectRepository(RentPayment) private readonly payments: Repository<RentPayment>,
    @InjectRepository(RentPaymentProof) private readonly proofs: Repository<RentPaymentProof>,
    @InjectRepository(Tenancy) private readonly tenancies: Repository<Tenancy>,
    @InjectRepository(TenancyAgreement) private readonly agreements: Repository<TenancyAgreement>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    private readonly dataSource: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly jobs: JobsService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.jobs.register('rent.scan', async () => this.scan());
  }

  async generate(userId: string, role: PortalRole | null, tenancyId: string, from: string, to: string) {
    const tenancy = await this.ownedTenancy(userId, role, tenancyId, 'RENT_APPROVE');
    const agreement = await this.agreements.findOne({
      where: { tenancyId, status: 'ACTIVE' as any },
      order: { version: 'DESC' },
    });
    if (!agreement) throw new BadRequestException('An active agreement is required');
    const created = [];
    let cursor = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    while (cursor <= end) {
      const year = cursor.getUTCFullYear();
      const month = cursor.getUTCMonth() + 1;
      const dueDay = String(agreement.rentDueDay).padStart(2, '0');
      const dueDate = `${year}-${String(month).padStart(2, '0')}-${dueDay}`;
      const existing = await this.obligations.findOne({
        where: { tenancyId, periodYear: year, periodMonth: month },
      });
      if (!existing) {
        const today = toIsoDate(new Date());
        const status = deriveRentStatus({
          amount: agreement.monthlyRent,
          confirmedAmount: zeroAmount(agreement.currencyCode),
          currency: agreement.currencyCode,
          dueDate,
          today,
          pendingProof: false,
          proofUnderReview: false,
        });
        created.push(await this.obligations.save(this.obligations.create({
          tenancyId,
          agreementId: agreement.id,
          propertyId: tenancy.propertyId,
          periodYear: year,
          periodMonth: month,
          dueDate,
          amount: agreement.monthlyRent,
          currencyCode: agreement.currencyCode,
          status,
        })));
      }
      cursor = new Date(Date.UTC(year, month, 1));
    }
    return created;
  }

  async list(userId: string, role: PortalRole | null, tenancyId?: string) {
    const rows = tenancyId
      ? await this.obligations.find({ where: { tenancyId }, order: { dueDate: 'ASC' } })
      : await this.obligations.find({ order: { dueDate: 'DESC' }, take: 200 });
    const visible = [];
    for (const row of rows) {
      try {
        await this.access.assertPermission(userId, role, row.propertyId, 'RENT_VIEW', row.tenancyId);
        visible.push(await this.withTotals(row));
      } catch {
        continue;
      }
    }
    return visible;
  }

  async submitProof(
    userId: string,
    role: PortalRole | null,
    obligationId: string,
    amount: string,
    file: Express.Multer.File,
  ) {
    const obligation = await this.obligations.findOne({ where: { id: obligationId } });
    if (!obligation) throw new NotFoundException('Rent obligation was not found');
    await this.access.assertPermission(userId, role, obligation.propertyId, 'RENT_VIEW', obligation.tenancyId);
    if (!file) throw new BadRequestException('A payment proof file is required');
    assertAllowedUpload(file.mimetype, file.size, uploadLimitBytes(this.config));
    if (compareAmounts(amount, zeroAmount(obligation.currencyCode), obligation.currencyCode) <= 0) {
      throw new BadRequestException('Proof amount must be greater than zero');
    }
    const storageKey = await this.storage.save(file.buffer, file.originalname);
    const proof = await this.proofs.save(this.proofs.create({
      obligationId,
      storageKey,
      amount,
      status: ProofStatus.SUBMITTED,
      submittedByUserId: userId,
    }));
    await this.refreshStatus(obligationId);
    const tenancy = await this.tenancies.findOne({ where: { id: obligation.tenancyId } });
    if (tenancy) {
      await this.notifications.notify({
        userId: tenancy.ownerUserId,
        type: 'rent.proof_submitted',
        title: 'Payment proof submitted',
        body: 'A rent payment proof is waiting for review.',
        dedupeParts: ['proof', proof.id],
      });
    }
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'rent.proof_submitted',
      entityType: 'rent_payment_proof',
      entityId: proof.id,
      propertyId: obligation.propertyId,
      tenancyId: obligation.tenancyId,
    });
    return proof;
  }

  async decideProof(
    userId: string,
    role: PortalRole | null,
    proofId: string,
    approve: boolean,
    notes?: string,
    idempotencyKey?: string,
  ) {
    const proof = await this.proofs.findOne({ where: { id: proofId } });
    if (!proof) throw new NotFoundException('Payment proof was not found');
    const obligation = await this.obligations.findOne({ where: { id: proof.obligationId } });
    await this.access.assertPermission(userId, role, obligation.propertyId, 'RENT_APPROVE', obligation.tenancyId);
    if (proof.status === ProofStatus.APPROVED || proof.status === ProofStatus.REJECTED) {
      return proof;
    }
    if (!approve && !notes) throw new BadRequestException('A rejection reason is required');
    await this.dataSource.transaction(async (manager) => {
      if (approve) {
        if (idempotencyKey) {
          const existing = await manager.findOne(RentPayment, { where: { idempotencyKey } });
          if (existing) return;
        }
        const payment = await manager.save(manager.create(RentPayment, {
          obligationId: obligation.id,
          amount: proof.amount,
          currencyCode: obligation.currencyCode,
          method: 'PROOF',
          reference: proof.id,
          status: LedgerStatus.CONFIRMED,
          paidAt: new Date(),
          reviewerUserId: userId,
          reviewNotes: notes,
          idempotencyKey: idempotencyKey || `proof:${proof.id}`,
          createdByUserId: userId,
        }));
        await manager.update(RentPaymentProof, { id: proof.id }, {
          status: ProofStatus.APPROVED,
          paymentId: payment.id,
          reviewedByUserId: userId,
          reviewedAt: new Date(),
          reviewNotes: notes,
        });
      } else {
        await manager.update(RentPaymentProof, { id: proof.id }, {
          status: ProofStatus.REJECTED,
          reviewedByUserId: userId,
          reviewedAt: new Date(),
          reviewNotes: notes,
        });
      }
    });
    await this.refreshStatus(obligation.id);
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: approve ? 'rent.proof_approved' : 'rent.proof_rejected',
      entityType: 'rent_payment_proof',
      entityId: proof.id,
      propertyId: obligation.propertyId,
      tenancyId: obligation.tenancyId,
    });
    return this.proofs.findOne({ where: { id: proof.id } });
  }

  async recordPayment(
    userId: string,
    role: PortalRole | null,
    obligationId: string,
    input: { amount: string; method: string; reference?: string; idempotencyKey?: string },
  ) {
    const obligation = await this.obligations.findOne({ where: { id: obligationId } });
    if (!obligation) throw new NotFoundException('Rent obligation was not found');
    await this.access.assertPermission(userId, role, obligation.propertyId, 'RENT_APPROVE', obligation.tenancyId);
    if (input.idempotencyKey) {
      const existing = await this.payments.findOne({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;
    }
    const totals = await this.withTotals(obligation);
    if (compareAmounts(input.amount, totals.remaining, obligation.currencyCode) > 0) {
      throw new BadRequestException('Payment exceeds the remaining balance. Record the extra as a separate credit note instead.');
    }
    const payment = await this.payments.save(this.payments.create({
      obligationId,
      amount: input.amount,
      currencyCode: obligation.currencyCode,
      method: input.method,
      reference: input.reference,
      status: LedgerStatus.CONFIRMED,
      paidAt: new Date(),
      reviewerUserId: userId,
      idempotencyKey: input.idempotencyKey,
      createdByUserId: userId,
    }));
    await this.refreshStatus(obligationId);
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'rent.payment_recorded',
      entityType: 'rent_payment',
      entityId: payment.id,
      propertyId: obligation.propertyId,
      tenancyId: obligation.tenancyId,
    });
    return payment;
  }

  async statement(userId: string, role: PortalRole | null, from: string, to: string, propertyId?: string) {
    const rows = await this.list(userId, role);
    return rows
      .filter((row) => row.dueDate >= from && row.dueDate <= to)
      .filter((row) => !propertyId || row.propertyId === propertyId)
      .map((row) => ({
        period: `${row.periodYear}-${String(row.periodMonth).padStart(2, '0')}`,
        propertyId: row.propertyId,
        amount: row.amount,
        paid: row.confirmedAmount,
        remaining: row.remaining,
        status: row.status,
        currency: row.currencyCode,
        transactions: row.transactions,
      }));
  }

  async remind(userId: string, role: PortalRole | null, obligationId: string) {
    const obligation = await this.obligations.findOne({ where: { id: obligationId } });
    if (!obligation) throw new NotFoundException('Rent obligation was not found');
    await this.access.assertPermission(userId, role, obligation.propertyId, 'RENT_APPROVE', obligation.tenancyId);
    const tenancy = await this.tenancies.findOne({ where: { id: obligation.tenancyId } });
    if (!tenancy?.tenantUserId) throw new BadRequestException('This tenancy has no tenant to remind');
    await this.notifications.notify({
      userId: tenancy.tenantUserId,
      type: 'rent.reminder',
      title: 'Rent reminder',
      body: `Rent of ${obligation.amount} ${obligation.currencyCode} is due on ${obligation.dueDate}.`,
      dedupeParts: ['manual', obligation.id, toIsoDate(new Date())],
    });
    return { reminded: true };
  }

  async refreshStatus(obligationId: string) {
    const obligation = await this.obligations.findOne({ where: { id: obligationId } });
    if (!obligation) return;
    const payments = await this.payments.find({ where: { obligationId } });
    const proofs = await this.proofs.find({ where: { obligationId } });
    const confirmedAmount = confirmedIncome(payments, obligation.currencyCode);
    const status = deriveRentStatus({
      amount: obligation.amount,
      confirmedAmount,
      currency: obligation.currencyCode,
      dueDate: obligation.dueDate,
      today: toIsoDate(new Date()),
      pendingProof: proofs.some((proof) => proof.status === ProofStatus.SUBMITTED),
      proofUnderReview: proofs.some((proof) => proof.status === ProofStatus.UNDER_REVIEW),
    });
    await this.obligations.update({ id: obligationId }, { status });
  }

  private async withTotals(obligation: RentObligation) {
    const payments = await this.payments.find({ where: { obligationId: obligation.id }, order: { createdAt: 'ASC' } });
    const proofs = await this.proofs.find({ where: { obligationId: obligation.id } });
    const confirmedAmount = confirmedIncome(payments, obligation.currencyCode);
    const { remaining, overpaid } = clampRemaining(obligation.amount, confirmedAmount, obligation.currencyCode);
    return {
      ...obligation,
      confirmedAmount,
      remaining,
      overpaid,
      transactions: payments.map((payment) => ({
        id: payment.id,
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference,
        status: payment.status,
        dueDate: obligation.dueDate,
        paidDate: payment.paidAt,
        reviewNotes: payment.reviewNotes,
        proof: proofs.find((proof) => proof.paymentId === payment.id) || null,
      })),
    };
  }

  private async ownedTenancy(userId: string, role: PortalRole | null, tenancyId: string, permission: 'RENT_APPROVE' | 'RENT_VIEW') {
    const tenancy = await this.tenancies.findOne({ where: { id: tenancyId } });
    if (!tenancy) throw new NotFoundException('Tenancy was not found');
    await this.access.assertPermission(userId, role, tenancy.propertyId, permission, tenancy.id);
    return tenancy;
  }

  private async scan() {
    const today = toIsoDate(new Date());
    const rows = await this.obligations.find();
    for (const row of rows) {
      await this.refreshStatus(row.id);
      const current = await this.obligations.findOne({ where: { id: row.id } });
      if (!current) continue;
      const tenancy = await this.tenancies.findOne({ where: { id: current.tenancyId } });
      if (!tenancy?.tenantUserId) continue;
      const preference = await this.notifications.preferencesFor(tenancy.tenantUserId);
      const days = preference?.rentReminderDays ?? 3;
      const auto = preference?.autoRemind ?? true;
      const target = toIsoDate(new Date(Date.now() + days * 86400000));
      if (auto && current.dueDate === target && current.status !== RentStatus.PAID) {
        await this.notifications.notify({
          userId: tenancy.tenantUserId,
          type: 'rent.reminder',
          title: 'Upcoming rent',
          body: `Rent is due on ${current.dueDate}.`,
          dedupeParts: ['auto', current.id, current.dueDate],
        });
      }
      if (current.dueDate < today && current.status !== RentStatus.PAID) {
        await this.notifications.notify({
          userId: tenancy.ownerUserId,
          type: 'rent.overdue',
          title: 'Rent overdue',
          body: `Rent due ${current.dueDate} is still open.`,
          dedupeParts: ['overdue', current.id, today.slice(0, 7)],
        });
      }
    }
    const tomorrow = this.jobs.nextDay();
    await this.jobs.enqueue('rent.scan', {}, {
      runAt: tomorrow,
      dedupeKey: buildDedupeKey('rent.scan', [toIsoDate(tomorrow)]),
    });
  }
}
