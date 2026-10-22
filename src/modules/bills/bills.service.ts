import { BadRequestException, Injectable, NotFoundException, OnModuleInit, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  BillStatus,
  IntegrationCapability,
  LedgerStatus,
  PortalRole,
  ProofStatus,
  ResponsibilityMode,
  TenancyStatus,
} from '../../common/enums';
import { toIsoDate } from '../../common/utils/dates.util';
import { assertAllowedUpload } from '../../common/utils/files.util';
import { clampRemaining, compareAmounts, sumAmounts, zeroAmount } from '../../common/utils/money.util';
import {
  Bill,
  BillFetchAttempt,
  BillPayment,
  BillPaymentProof,
  BillResponsibility,
  Property,
  Tenancy,
  UtilityProvider,
} from '../../database/entities';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { JobsService } from '../jobs/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { uploadLimitBytes, StorageService } from '../storage/storage.service';
import { billNotifyTargets } from './bill.rules';

@Injectable()
export class BillsService implements OnModuleInit {
  constructor(
    @InjectRepository(Bill) private readonly bills: Repository<Bill>,
    @InjectRepository(BillResponsibility) private readonly shares: Repository<BillResponsibility>,
    @InjectRepository(BillPayment) private readonly payments: Repository<BillPayment>,
    @InjectRepository(BillPaymentProof) private readonly proofs: Repository<BillPaymentProof>,
    @InjectRepository(BillFetchAttempt) private readonly attempts: Repository<BillFetchAttempt>,
    @InjectRepository(UtilityProvider) private readonly providers: Repository<UtilityProvider>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(Tenancy) private readonly tenancies: Repository<Tenancy>,
    private readonly dataSource: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly jobs: JobsService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.jobs.register('bill.scan', async () => this.scanDue());
  }

  providersList() {
    return this.providers.find({ order: { name: 'ASC' } });
  }

  async create(userId: string, role: PortalRole | null, input: {
    propertyId: string;
    tenancyId?: string;
    providerId?: string;
    category: string;
    consumerNumber?: string;
    periodStart?: string;
    periodEnd?: string;
    amount: string;
    currencyCode: string;
    issueDate?: string;
    dueDate?: string;
    externalReference?: string;
    responsibilityMode: ResponsibilityMode;
    shares?: Array<{ party: string; userId?: string; shareAmount?: string; sharePercent?: string; ruleNote?: string }>;
  }, file?: Express.Multer.File) {
    await this.access.assertPermission(userId, role, input.propertyId, 'BILL_MANAGE', input.tenancyId);
    if (input.providerId && input.externalReference) {
      const duplicate = await this.bills.findOne({
        where: { providerId: input.providerId, externalReference: input.externalReference },
      });
      if (duplicate) return duplicate;
    }
    let documentStorageKey: string | undefined;
    if (file) {
      assertAllowedUpload(file.mimetype, file.size, uploadLimitBytes(this.config));
      documentStorageKey = await this.storage.save(file.buffer, file.originalname);
    }
    const property = await this.properties.findOne({ where: { id: input.propertyId } });
    if (!property) throw new NotFoundException('Property was not found');
    const bill = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(manager.create(Bill, {
        ...input,
        category: input.category as any,
        documentStorageKey,
        status: BillStatus.ISSUED,
        createdByUserId: userId,
      }));
      const parties = input.shares?.length
        ? input.shares
        : [{ party: input.responsibilityMode, userId }];
      for (const share of parties) {
        await manager.save(manager.create(BillResponsibility, { billId: saved.id, ...share }));
      }
      return saved;
    });
    if (input.providerId && input.consumerNumber) {
      await this.attempts.update(
        { propertyId: input.propertyId, providerId: input.providerId, consumerNumber: input.consumerNumber, billId: IsNull() },
        { billId: bill.id },
      );
    }
    await this.notify(bill, property);
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'bill.created',
      entityType: 'bill',
      entityId: bill.id,
      propertyId: bill.propertyId,
      tenancyId: bill.tenancyId,
    });
    return bill;
  }

  async list(userId: string, role: PortalRole | null, propertyId?: string) {
    const rows = await this.bills.find({
      where: propertyId ? { propertyId } : {},
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const visible = [];
    for (const row of rows) {
      try {
        await this.access.assertPermission(userId, role, row.propertyId, 'BILL_VIEW', row.tenancyId || undefined);
        if (role === PortalRole.TENANT && row.responsibilityMode === ResponsibilityMode.OWNER) continue;
        visible.push(row);
      } catch {
        continue;
      }
    }
    return visible;
  }

  async get(userId: string, role: PortalRole | null, id: string) {
    const bill = await this.visibleBill(userId, role, id);
    const responsibilities = await this.shares.find({ where: { billId: id } });
    const proofs = await this.proofs.find({ where: { billId: id }, order: { createdAt: 'DESC' } });
    const fetchAttempt = await this.latestAttempt(bill);
    return { ...bill, responsibilities, proofs, fetchAttempt };
  }

  async fetch(userId: string, role: PortalRole | null, input: {
    propertyId: string;
    providerId: string;
    consumerNumber: string;
  }) {
    await this.access.assertPermission(userId, role, input.propertyId, 'BILL_VIEW');
    const provider = await this.providers.findOne({ where: { id: input.providerId } });
    if (!provider) throw new NotFoundException('Utility provider was not found');
    const errorMessage = this.fetchFailure(provider);
    const attempt = await this.attempts.save(this.attempts.create({
      propertyId: input.propertyId,
      providerId: provider.id,
      consumerNumber: input.consumerNumber,
      requestedByUserId: userId,
      status: 'FAILED',
      errorMessage,
    }));
    provider.lastError = errorMessage;
    await this.providers.save(provider);
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'bill.fetch_failed',
      entityType: 'bill_fetch_attempt',
      entityId: attempt.id,
      propertyId: input.propertyId,
      metadata: { providerId: provider.id, capability: provider.capability },
    });
    return attempt;
  }

  async submitProof(
    userId: string,
    role: PortalRole | null,
    billId: string,
    amount: string,
    file?: Express.Multer.File,
  ) {
    const bill = await this.visibleBill(userId, role, billId);
    if (!file) throw new BadRequestException('A payment proof file is required');
    if (bill.status === BillStatus.PAID || bill.status === BillStatus.CANCELLED) {
      throw new BadRequestException('This bill is not open for a payment proof');
    }
    try {
      assertAllowedUpload(file.mimetype, file.size, uploadLimitBytes(this.config));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Unsupported file type');
    }
    if (compareAmounts(amount, zeroAmount(bill.currencyCode), bill.currencyCode) <= 0) {
      throw new BadRequestException('Proof amount must be greater than zero');
    }
    const remaining = await this.remaining(bill);
    if (compareAmounts(amount, remaining, bill.currencyCode) > 0) {
      throw new BadRequestException('Proof amount exceeds the remaining balance');
    }
    const storageKey = await this.storage.save(file.buffer, file.originalname);
    const proof = await this.proofs.save(this.proofs.create({
      billId,
      storageKey,
      mimeType: file.mimetype,
      amount,
      status: ProofStatus.SUBMITTED,
      submittedByUserId: userId,
    }));
    const property = await this.properties.findOne({ where: { id: bill.propertyId } });
    if (property) {
      await this.notifications.notify({
        userId: property.ownerUserId,
        type: 'bill.proof_submitted',
        title: 'Bill payment proof submitted',
        body: 'A bill payment proof is waiting for review.',
        dedupeParts: ['bill-proof', proof.id],
      });
    }
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'bill.proof_submitted',
      entityType: 'bill_payment_proof',
      entityId: proof.id,
      propertyId: bill.propertyId,
      tenancyId: bill.tenancyId,
    });
    return proof;
  }

  async decideProof(userId: string, role: PortalRole | null, proofId: string, approve: boolean, notes?: string) {
    const proof = await this.proofs.findOne({ where: { id: proofId } });
    if (!proof) throw new NotFoundException('Bill payment proof was not found');
    const bill = await this.bills.findOne({ where: { id: proof.billId } });
    if (!bill) throw new NotFoundException('Bill was not found');
    await this.access.assertPermission(userId, role, bill.propertyId, 'BILL_MANAGE', bill.tenancyId || undefined);
    if (proof.status === ProofStatus.APPROVED || proof.status === ProofStatus.REJECTED) return proof;
    if (!approve && !notes) throw new BadRequestException('A rejection reason is required');
    await this.dataSource.transaction(async (manager) => {
      if (approve) {
        const payment = await manager.save(manager.create(BillPayment, {
          billId: bill.id,
          amount: proof.amount,
          currencyCode: bill.currencyCode,
          payerRole: role || PortalRole.OWNER,
          payerUserId: proof.submittedByUserId,
          status: LedgerStatus.CONFIRMED,
          method: 'PROOF',
          reference: proof.id,
          idempotencyKey: `proof:${proof.id}`,
        }));
        await manager.update(BillPaymentProof, { id: proof.id }, {
          status: ProofStatus.APPROVED,
          paymentId: payment.id,
          reviewedByUserId: userId,
          reviewedAt: new Date(),
          reviewNotes: notes,
        });
        const confirmed = await manager.find(BillPayment, {
          where: { billId: bill.id, status: LedgerStatus.CONFIRMED },
        });
        const paid = sumAmounts(confirmed.map((row) => row.amount), bill.currencyCode);
        bill.status = compareAmounts(paid, bill.amount, bill.currencyCode) >= 0
          ? BillStatus.PAID
          : BillStatus.PARTIAL;
        await manager.update(Bill, { id: bill.id }, { status: bill.status });
      } else {
        await manager.update(BillPaymentProof, { id: proof.id }, {
          status: ProofStatus.REJECTED,
          reviewedByUserId: userId,
          reviewedAt: new Date(),
          reviewNotes: notes,
        });
      }
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: approve ? 'bill.proof_approved' : 'bill.proof_rejected',
      entityType: 'bill_payment_proof',
      entityId: proof.id,
      propertyId: bill.propertyId,
      tenancyId: bill.tenancyId,
    });
    return this.proofs.findOne({ where: { id: proof.id } });
  }

  async downloadProof(userId: string, role: PortalRole | null, proofId: string) {
    const proof = await this.proofs.findOne({ where: { id: proofId } });
    if (!proof) throw new NotFoundException('Bill payment proof was not found');
    await this.visibleBill(userId, role, proof.billId);
    return new StreamableFile(this.storage.open(proof.storageKey), {
      type: proof.mimeType || 'application/octet-stream',
      disposition: 'attachment; filename="bill-proof"',
    });
  }

  private async visibleBill(userId: string, role: PortalRole | null, id: string) {
    const bill = await this.bills.findOne({ where: { id } });
    if (!bill) throw new NotFoundException('Bill was not found');
    await this.access.assertPermission(userId, role, bill.propertyId, 'BILL_VIEW', bill.tenancyId || undefined);
    if (role === PortalRole.TENANT && bill.responsibilityMode === ResponsibilityMode.OWNER) {
      throw new NotFoundException('Bill was not found');
    }
    return bill;
  }

  private async latestAttempt(bill: Bill) {
    const linked = await this.attempts.findOne({
      where: { billId: bill.id },
      order: { createdAt: 'DESC' },
    });
    if (linked) return linked;
    if (!bill.providerId || !bill.consumerNumber) return null;
    return this.attempts.findOne({
      where: { propertyId: bill.propertyId, providerId: bill.providerId, consumerNumber: bill.consumerNumber },
      order: { createdAt: 'DESC' },
    });
  }

  private fetchFailure(provider: UtilityProvider) {
    if (!provider.enabled || provider.capability === IntegrationCapability.UNAVAILABLE) {
      return 'This provider is unavailable.';
    }
    if (provider.capability === IntegrationCapability.MANUAL) {
      return 'This provider does not offer a live bill fetch. Upload the bill instead.';
    }
    return 'The provider API is not configured.';
  }

  private async remaining(bill: Bill) {
    const confirmed = await this.payments.find({
      where: { billId: bill.id, status: LedgerStatus.CONFIRMED },
    });
    const paid = sumAmounts(confirmed.map((row) => row.amount), bill.currencyCode);
    return clampRemaining(bill.amount, paid, bill.currencyCode).remaining;
  }

  private async recipientIds(bill: Bill, property: Property) {
    const rented = Boolean(await this.tenancies.findOne({
      where: { propertyId: property.id, status: TenancyStatus.ACTIVE },
    }));
    const shares = await this.shares.find({ where: { billId: bill.id } });
    const targets = billNotifyTargets({
      mode: bill.responsibilityMode,
      propertyRented: rented,
      sharedParties: shares.map((share) => share.party),
    });
    const tenancy = bill.tenancyId
      ? await this.tenancies.findOne({ where: { id: bill.tenancyId } })
      : await this.tenancies.findOne({ where: { propertyId: property.id, status: TenancyStatus.ACTIVE } });
    const recipients = new Set<string>();
    if (targets.includes('OWNER')) recipients.add(property.ownerUserId);
    if (targets.includes('TENANT') && tenancy?.tenantUserId) recipients.add(tenancy.tenantUserId);
    for (const share of shares) {
      if (share.userId && targets.includes(share.party)) recipients.add(share.userId);
    }
    return [...recipients];
  }

  private async notify(bill: Bill, property: Property) {
    for (const userId of await this.recipientIds(bill, property)) {
      await this.notifications.notify({
        userId,
        type: 'bill.issued',
        title: 'New bill',
        body: `${bill.category} bill of ${bill.amount} ${bill.currencyCode} was added.`,
        dedupeParts: ['bill', bill.id, userId],
      });
    }
  }

  private async scanDue() {
    const rows = await this.bills.find();
    for (const bill of rows) {
      if (!bill.dueDate) continue;
      if ([BillStatus.PAID, BillStatus.CANCELLED, BillStatus.DRAFT].includes(bill.status)) continue;
      const property = await this.properties.findOne({ where: { id: bill.propertyId } });
      if (!property) continue;
      for (const userId of await this.recipientIds(bill, property)) {
        const preference = await this.notifications.preferencesFor(userId);
        const days = preference?.billReminderDays ?? 3;
        const auto = preference?.autoRemind ?? true;
        const target = toIsoDate(new Date(Date.now() + days * 86400000));
        if (!auto || bill.dueDate !== target) continue;
        await this.notifications.notify({
          userId,
          type: 'bill.reminder',
          title: 'Upcoming bill',
          body: `${bill.category} bill of ${bill.amount} ${bill.currencyCode} is due on ${bill.dueDate}.`,
          dedupeParts: ['bill-reminder', bill.id, userId, bill.dueDate],
        });
      }
    }
    const tomorrow = this.jobs.nextDay();
    await this.jobs.enqueue('bill.scan', {}, {
      runAt: tomorrow,
      dedupeKey: `bill.scan:${toIsoDate(tomorrow)}`,
    });
  }
}
