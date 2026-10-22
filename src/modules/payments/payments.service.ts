import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  BillStatus,
  LedgerStatus,
  PaymentIntentStatus,
  PaymentPurpose,
  PortalRole,
} from '../../common/enums';
import { sha256 } from '../../common/utils/tokens.util';
import { Bill, BillPayment, PaymentIntent, WebhookEvent } from '../../database/entities';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { applyVerifiedWebhook, rejectUnverifiedClientSuccess } from './payment.rules';
import { safeEqual, signPayload } from '../../common/utils/tokens.util';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentIntent) private readonly intents: Repository<PaymentIntent>,
    @InjectRepository(WebhookEvent) private readonly events: Repository<WebhookEvent>,
    @InjectRepository(Bill) private readonly bills: Repository<Bill>,
    @InjectRepository(BillPayment) private readonly billPayments: Repository<BillPayment>,
    private readonly dataSource: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  status() {
    const live = Boolean(this.config.get('PAYMENT_WEBHOOK_SECRET') && this.config.get('PAYMENT_PROVIDER'));
    return {
      provider: this.config.get('PAYMENT_PROVIDER') || 'sandbox',
      live,
      message: live
        ? 'Payment provider credentials are present. Webhooks still require a successful provider test.'
        : 'No live payment gateway is configured. Sandbox settlement is available outside production.',
    };
  }

  async createIntent(userId: string, role: PortalRole | null, input: {
    billId: string;
    idempotencyKey: string;
  }) {
    const existing = await this.intents.findOne({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    const bill = await this.bills.findOne({ where: { id: input.billId } });
    if (!bill) throw new NotFoundException('Bill was not found');
    await this.access.assertPermission(userId, role, bill.propertyId, 'BILL_VIEW', bill.tenancyId || undefined);
    return this.intents.save(this.intents.create({
      purpose: PaymentPurpose.BILL,
      targetId: bill.id,
      amount: bill.amount,
      currencyCode: bill.currencyCode,
      provider: this.config.get('PAYMENT_PROVIDER') || 'sandbox',
      status: PaymentIntentStatus.PENDING,
      idempotencyKey: input.idempotencyKey,
      payerUserId: userId,
      payerRole: role || 'OWNER',
    }));
  }

  clientReturn() {
    try {
      rejectUnverifiedClientSuccess();
    } catch {
      throw new BadRequestException('Payment status is confirmed only by a verified provider webhook.');
    }
  }

  async sandboxSettle(userId: string, intentId: string) {
    if (this.config.get('NODE_ENV') === 'production') {
      throw new ServiceUnavailableException('Sandbox settlement is disabled in production');
    }
    const intent = await this.intents.findOne({ where: { id: intentId, payerUserId: userId } });
    if (!intent) throw new NotFoundException('Payment intent was not found');
    if ((this.config.get('PAYMENT_PROVIDER') || 'sandbox') !== 'sandbox') {
      throw new ServiceUnavailableException('The configured provider is not the sandbox adapter');
    }
    return this.applyEvent({
      provider: 'sandbox',
      eventId: `sandbox:${intent.id}`,
      intentId: intent.id,
      status: PaymentIntentStatus.SUCCEEDED,
      payload: 'sandbox',
    });
  }

  async webhook(provider: string, rawBody: string, signature: string | undefined, eventId: string, intentId: string, status: PaymentIntentStatus) {
    const secret = this.config.get<string>('PAYMENT_WEBHOOK_SECRET');
    if (!secret) throw new ServiceUnavailableException('Payment webhook secret is not configured');
    const expected = signPayload(rawBody, secret);
    if (!signature || !safeEqual(signature, expected)) {
      throw new BadRequestException('Webhook signature is invalid');
    }
    return this.applyEvent({ provider, eventId, intentId, status, payload: rawBody });
  }

  private async applyEvent(input: {
    provider: string;
    eventId: string;
    intentId: string;
    status: PaymentIntentStatus;
    payload: string;
  }) {
    return this.dataSource.transaction(async (manager) => {
      const seenRows = await manager.find(WebhookEvent, { where: { provider: input.provider } });
      const seen = new Set(seenRows.map((row) => row.eventId));
      const intent = await manager.findOne(PaymentIntent, {
        where: { id: input.intentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!intent) throw new NotFoundException('Payment intent was not found');
      const result = applyVerifiedWebhook(intent, { eventId: input.eventId, status: input.status }, seen);
      if (result.duplicate) return { duplicate: true, intent };
      await manager.save(manager.create(WebhookEvent, {
        provider: input.provider,
        eventId: input.eventId,
        payloadHash: sha256(input.payload),
        status: 'PROCESSED',
        processedAt: new Date(),
      }));
      intent.status = result.state.status;
      await manager.save(intent);
      if (result.applyFinancialEffect && intent.purpose === PaymentPurpose.BILL) {
        const existingPayment = await manager.findOne(BillPayment, { where: { idempotencyKey: input.eventId } });
        if (!existingPayment) {
          await manager.save(manager.create(BillPayment, {
            billId: intent.targetId,
            amount: intent.amount,
            currencyCode: intent.currencyCode,
            payerRole: intent.payerRole,
            payerUserId: intent.payerUserId,
            status: LedgerStatus.CONFIRMED,
            method: intent.provider,
            reference: input.eventId,
            idempotencyKey: input.eventId,
          }));
          await manager.update(Bill, { id: intent.targetId }, { status: BillStatus.PAID });
        }
      }
      await this.audit.record({
        actorUserId: intent.payerUserId,
        actorType: 'SYSTEM',
        action: 'payment.webhook',
        entityType: 'payment_intent',
        entityId: intent.id,
        metadata: { status: intent.status, duplicate: false },
      });
      return { duplicate: false, intent };
    });
  }
}
