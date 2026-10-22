import { Column, Entity, Index, Unique } from 'typeorm';
import {
  BillCategory,
  BillStatus,
  IntegrationCapability,
  InvoiceStatus,
  LedgerStatus,
  PaymentIntentStatus,
  PaymentPurpose,
  ProofStatus,
  RentStatus,
  ResponsibilityMode,
  SubscriptionStatus,
} from '../../common/enums';
import { BaseEntity, CreatedEntity } from './base.entity';

@Entity('rent_obligations')
@Unique('uq_rent_period', ['tenancyId', 'periodYear', 'periodMonth'])
export class RentObligation extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  tenancyId: string;

  @Column({ type: 'uuid' })
  agreementId: string;

  @Column({ type: 'uuid' })
  propertyId: string;

  @Column({ type: 'int' })
  periodYear: number;

  @Column({ type: 'int' })
  periodMonth: number;

  @Column({ type: 'date' })
  dueDate: string;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  amount: string;

  @Column({ type: 'varchar', length: 3 })
  currencyCode: string;

  @Index()
  @Column({ type: 'varchar', length: 24, default: RentStatus.UPCOMING })
  status: RentStatus;
}

@Entity('rent_payments')
export class RentPayment extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  obligationId: string;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  amount: string;

  @Column({ type: 'varchar', length: 3 })
  currencyCode: string;

  @Column({ type: 'varchar', length: 32 })
  method: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reference?: string | null;

  @Index()
  @Column({ type: 'varchar', length: 16, default: LedgerStatus.PENDING })
  status: LedgerStatus;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  reviewerUserId?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reviewNotes?: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey?: string | null;

  @Column({ type: 'uuid' })
  createdByUserId: string;
}

@Entity('rent_payment_proofs')
export class RentPaymentProof extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  obligationId: string;

  @Column({ type: 'uuid', nullable: true })
  paymentId?: string | null;

  @Column({ type: 'varchar', length: 255 })
  storageKey: string;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  amount: string;

  @Column({ type: 'varchar', length: 16, default: ProofStatus.SUBMITTED })
  status: ProofStatus;

  @Column({ type: 'uuid' })
  submittedByUserId: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reviewNotes?: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedByUserId?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt?: Date | null;
}

@Entity('utility_providers')
export class UtilityProvider extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 2, nullable: true })
  countryIso2?: string | null;

  @Column({ type: 'varchar', length: 32 })
  category: string;

  @Column({ type: 'varchar', length: 16, default: IntegrationCapability.MANUAL })
  capability: IntegrationCapability;

  @Column({ type: 'text', nullable: true })
  authRequirements?: string | null;

  @Column({ type: 'simple-json', nullable: true })
  supportedOperations?: string[] | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSuccessAt?: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastError?: string | null;

  @Column({ type: 'varchar', length: 64, default: 'manual' })
  retryPolicy: string;

  @Column({ default: true })
  enabled: boolean;
}

@Entity('bills')
@Unique('uq_bill_provider_reference', ['providerId', 'externalReference'])
export class Bill extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  propertyId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  tenancyId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  providerId?: string | null;

  @Column({ type: 'varchar', length: 32 })
  category: BillCategory;

  @Column({ type: 'varchar', length: 80, nullable: true })
  consumerNumber?: string | null;

  @Column({ type: 'date', nullable: true })
  periodStart?: string | null;

  @Column({ type: 'date', nullable: true })
  periodEnd?: string | null;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  amount: string;

  @Column({ type: 'varchar', length: 3 })
  currencyCode: string;

  @Column({ type: 'date', nullable: true })
  issueDate?: string | null;

  @Column({ type: 'date', nullable: true })
  dueDate?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  documentStorageKey?: string | null;

  @Column({ type: 'varchar', length: 16, default: BillStatus.ISSUED })
  status: BillStatus;

  @Column({ type: 'varchar', length: 120, nullable: true })
  externalReference?: string | null;

  @Column({ type: 'varchar', length: 16 })
  responsibilityMode: ResponsibilityMode;

  @Column({ type: 'uuid' })
  createdByUserId: string;
}

@Entity('bill_responsibilities')
export class BillResponsibility extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  billId: string;

  @Column({ type: 'varchar', length: 16 })
  party: string;

  @Column({ type: 'uuid', nullable: true })
  userId?: string | null;

  @Column({ type: 'decimal', precision: 19, scale: 4, nullable: true })
  shareAmount?: string | null;

  @Column({ type: 'decimal', precision: 8, scale: 4, nullable: true })
  sharePercent?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ruleNote?: string | null;
}

@Entity('bill_payments')
export class BillPayment extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  billId: string;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  amount: string;

  @Column({ type: 'varchar', length: 3 })
  currencyCode: string;

  @Column({ type: 'varchar', length: 16 })
  payerRole: string;

  @Column({ type: 'uuid' })
  payerUserId: string;

  @Column({ type: 'varchar', length: 16, default: LedgerStatus.CONFIRMED })
  status: LedgerStatus;

  @Column({ type: 'varchar', length: 32 })
  method: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reference?: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey?: string | null;
}

@Entity('bill_payment_proofs')
export class BillPaymentProof extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  billId: string;

  @Column({ type: 'uuid', nullable: true })
  paymentId?: string | null;

  @Column({ type: 'varchar', length: 255 })
  storageKey: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  mimeType?: string | null;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  amount: string;

  @Column({ type: 'varchar', length: 16, default: ProofStatus.SUBMITTED })
  status: ProofStatus;

  @Column({ type: 'uuid' })
  submittedByUserId: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reviewNotes?: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedByUserId?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt?: Date | null;
}

@Entity('bill_fetch_attempts')
export class BillFetchAttempt extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  propertyId: string;

  @Index()
  @Column({ type: 'uuid' })
  providerId: string;

  @Column({ type: 'varchar', length: 80 })
  consumerNumber: string;

  @Column({ type: 'uuid' })
  requestedByUserId: string;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  errorMessage?: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  billId?: string | null;
}

@Entity('payment_intents')
export class PaymentIntent extends BaseEntity {
  @Column({ type: 'varchar', length: 16 })
  purpose: PaymentPurpose;

  @Index()
  @Column({ type: 'uuid' })
  targetId: string;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  amount: string;

  @Column({ type: 'varchar', length: 3 })
  currencyCode: string;

  @Column({ type: 'varchar', length: 32, default: 'sandbox' })
  provider: string;

  @Index()
  @Column({ type: 'varchar', length: 16, default: PaymentIntentStatus.PENDING })
  status: PaymentIntentStatus;

  @Column({ type: 'varchar', length: 120, nullable: true })
  providerReference?: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  idempotencyKey: string;

  @Column({ type: 'uuid' })
  payerUserId: string;

  @Column({ type: 'varchar', length: 16 })
  payerRole: string;
}

@Entity('webhook_events')
export class WebhookEvent extends CreatedEntity {
  @Column({ type: 'varchar', length: 32 })
  provider: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 160 })
  eventId: string;

  @Column({ type: 'varchar', length: 128 })
  payloadHash: string;

  @Column({ type: 'varchar', length: 16, default: 'PROCESSED' })
  status: string;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt?: Date | null;
}

@Entity('subscription_plans')
export class SubscriptionPlan extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'int' })
  minUnits: number;

  @Column({ type: 'int', nullable: true })
  maxUnits?: number | null;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  pricePerUnit: string;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currencyCode: string;

  @Column({ type: 'int', default: 0 })
  trialDays: number;

  @Column({ type: 'int', default: 0 })
  trialUnits: number;
}

@Entity('subscriptions')
export class Subscription extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  accountUserId: string;

  @Column({ type: 'varchar', length: 16, default: SubscriptionStatus.TRIALING })
  status: SubscriptionStatus;

  @Column({ type: 'varchar', length: 32, nullable: true })
  planCode?: string | null;

  @Column({ default: false })
  trialUsed: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  trialStartedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  trialEndsAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodStart?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd?: Date | null;

  @Column({ default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ type: 'int', default: 0 })
  activeUnitCount: number;
}

@Entity('subscription_invoices')
export class SubscriptionInvoice extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  subscriptionId: string;

  @Column({ type: 'timestamptz' })
  periodStart: Date;

  @Column({ type: 'timestamptz' })
  periodEnd: Date;

  @Column({ type: 'int' })
  unitCount: number;

  @Column({ type: 'int', default: 0 })
  billableUnits: number;

  @Column({ type: 'varchar', length: 32 })
  planCode: string;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  pricePerUnit: string;

  @Column({ type: 'varchar', length: 3 })
  currencyCode: string;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  subtotal: string;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 0 })
  tax: string;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  total: string;

  @Column({ type: 'varchar', length: 16, default: InvoiceStatus.OPEN })
  status: InvoiceStatus;

  @Column({ type: 'varchar', length: 120, nullable: true })
  paymentReference?: string | null;
}

@Entity('property_expenses')
export class PropertyExpense extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  propertyId: string;

  @Column({ type: 'varchar', length: 32 })
  category: string;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  amount: string;

  @Column({ type: 'varchar', length: 3 })
  currencyCode: string;

  @Column({ type: 'date' })
  incurredOn: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 32 })
  source: string;

  @Column({ type: 'uuid', nullable: true })
  sourceId?: string | null;

  @Column({ type: 'varchar', length: 16, default: 'RECORDED' })
  status: string;

  @Column({ type: 'uuid' })
  createdByUserId: string;
}
