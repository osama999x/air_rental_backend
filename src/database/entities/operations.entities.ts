import { Column, Entity, Index } from 'typeorm';
import {
  HandoverStatus,
  HandoverType,
  InspectionStatus,
  InsuranceHolder,
  MaintenanceStatus,
  SettlementStatus,
  VerificationStatus,
  DocumentOwnerType,
} from '../../common/enums';
import { BaseEntity, CreatedEntity } from './base.entity';

@Entity('maintenance_requests')
export class MaintenanceRequest extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  propertyId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  tenancyId?: string | null;

  @Column({ type: 'uuid' })
  requestedByUserId: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 64 })
  category: string;

  @Column({ type: 'varchar', length: 16, default: 'NORMAL' })
  priority: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  preferredAccessTime?: string | null;

  @Index()
  @Column({ type: 'varchar', length: 16, default: MaintenanceStatus.NEW })
  status: MaintenanceStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  rejectionReason?: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  contractorName?: string | null;

  @Column({ type: 'decimal', precision: 19, scale: 4, nullable: true })
  estimateAmount?: string | null;

  @Column({ type: 'decimal', precision: 19, scale: 4, nullable: true })
  approvedAmount?: string | null;

  @Column({ type: 'decimal', precision: 19, scale: 4, nullable: true })
  finalAmount?: string | null;

  @Column({ type: 'varchar', length: 3 })
  currencyCode: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  responsibleParty?: string | null;
}

@Entity('maintenance_events')
export class MaintenanceEvent extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  requestId: string;

  @Column({ type: 'uuid', nullable: true })
  actorUserId?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  fromStatus?: string | null;

  @Column({ type: 'varchar', length: 16 })
  toStatus: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;
}

@Entity('maintenance_attachments')
export class MaintenanceAttachment extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  requestId: string;

  @Column({ type: 'varchar', length: 255 })
  storageKey: string;

  @Column({ type: 'varchar', length: 120 })
  mimeType: string;

  @Column({ type: 'varchar', length: 180, nullable: true })
  originalName?: string | null;
}

@Entity('inspections')
export class Inspection extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  propertyId: string;

  @Column({ type: 'uuid', nullable: true })
  tenancyId?: string | null;

  @Column({ type: 'uuid' })
  inspectorUserId: string;

  @Column({ type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  generalCondition?: string | null;

  @Column({ type: 'text', nullable: true })
  comments?: string | null;

  @Column({ type: 'varchar', length: 16, default: InspectionStatus.SCHEDULED })
  status: InspectionStatus;

  @Column({ type: 'uuid' })
  createdByUserId: string;
}

@Entity('inspection_items')
export class InspectionItem extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  inspectionId: string;

  @Column({ type: 'varchar', length: 16 })
  kind: string;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  valueText?: string | null;

  @Column({ type: 'decimal', precision: 19, scale: 4, nullable: true })
  numericValue?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  unit?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  storageKey?: string | null;
}

@Entity('handovers')
export class Handover extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  tenancyId: string;

  @Index()
  @Column({ type: 'uuid' })
  propertyId: string;

  @Column({ type: 'varchar', length: 16 })
  type: HandoverType;

  @Column({ type: 'text', nullable: true })
  conditionSummary?: string | null;

  @Column({ type: 'varchar', length: 32, default: HandoverStatus.DRAFT })
  status: HandoverStatus;

  @Column({ type: 'uuid' })
  createdByUserId: string;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedByTenantAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedByOwnerAt?: Date | null;
}

@Entity('handover_items')
export class HandoverItem extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  handoverId: string;

  @Column({ type: 'varchar', length: 16 })
  kind: string;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  valueText?: string | null;

  @Column({ type: 'decimal', precision: 19, scale: 4, nullable: true })
  numericValue?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  unit?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  storageKey?: string | null;
}

@Entity('security_deposit_settlements')
export class SecurityDepositSettlement extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  tenancyId: string;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  depositReceived: string;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 0 })
  deductionAmount: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  deductionReason?: string | null;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  refundAmount: string;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  remainingBalance: string;

  @Column({ type: 'varchar', length: 16, default: SettlementStatus.OPEN })
  status: SettlementStatus;

  @Column({ type: 'varchar', length: 3 })
  currencyCode: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  paymentReference?: string | null;

  @Column({ type: 'uuid', nullable: true })
  approvedByUserId?: string | null;
}

@Entity('documents')
export class DocumentRecord extends BaseEntity {
  @Column({ type: 'varchar', length: 16 })
  ownerType: DocumentOwnerType;

  @Column({ type: 'uuid' })
  ownerId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  propertyId?: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  tenancyId?: string | null;

  @Column({ type: 'varchar', length: 64 })
  category: string;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'varchar', length: 255 })
  storageKey: string;

  @Column({ type: 'varchar', length: 120 })
  mimeType: string;

  @Column({ type: 'uuid' })
  uploadedByUserId: string;

  @Column({ type: 'varchar', length: 16, default: VerificationStatus.UNVERIFIED })
  verificationStatus: VerificationStatus;

  @Column({ type: 'date', nullable: true })
  expiresAt?: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  identityNumberLast4?: string | null;
}

@Entity('insurance_policies')
export class InsurancePolicy extends BaseEntity {
  @Column({ type: 'varchar', length: 16 })
  holderRole: InsuranceHolder;

  @Index()
  @Column({ type: 'uuid' })
  propertyId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  tenancyId?: string | null;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 160 })
  providerName: string;

  @Column({ type: 'varchar', length: 80 })
  policyNumber: string;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'uuid', nullable: true })
  documentId?: string | null;

  @Column({ type: 'varchar', length: 16, default: VerificationStatus.UNVERIFIED })
  status: VerificationStatus;
}
