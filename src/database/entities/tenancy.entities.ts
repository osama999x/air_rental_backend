import { Column, Entity, Index, Unique } from 'typeorm';
import {
  AgreementStatus,
  AssignmentSide,
  AssignmentStatus,
  InvitationStatus,
  ParticipantSide,
  RenewalStatus,
  TenancyStatus,
} from '../../common/enums';
import { BaseEntity, CreatedEntity } from './base.entity';

@Entity('tenancies')
export class Tenancy extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  propertyId: string;

  @Index()
  @Column({ type: 'uuid' })
  ownerUserId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  tenantUserId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  tenantOrganizationId?: string | null;

  @Index()
  @Column({ type: 'varchar', length: 16, default: TenancyStatus.PROPOSED })
  status: TenancyStatus;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date', nullable: true })
  endDate?: string | null;

  @Column({ type: 'varchar', length: 3 })
  currencyCode: string;

  @Column({ type: 'uuid', nullable: true })
  chatThreadId?: string | null;
}

@Entity('invitations')
export class Invitation extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  tenancyId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone?: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  tokenHash: string;

  @Column({ type: 'varchar', length: 16, default: InvitationStatus.PENDING })
  status: InvitationStatus;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'uuid', nullable: true })
  acceptedByUserId?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt?: Date | null;

  @Column({ type: 'uuid' })
  createdByUserId: string;
}

@Entity('tenancy_participants')
@Unique('uq_tenancy_participant', ['tenancyId', 'userId', 'side'])
export class TenancyParticipant extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  tenancyId: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16 })
  side: ParticipantSide;
}

@Entity('manager_assignments')
export class ManagerAssignment extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  assigningUserId: string;

  @Index()
  @Column({ type: 'uuid' })
  managerUserId: string;

  @Column({ type: 'varchar', length: 16 })
  side: AssignmentSide;

  @Index()
  @Column({ type: 'varchar', length: 16, default: AssignmentStatus.PENDING })
  status: AssignmentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  startsAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endsAt?: Date | null;

  @Column({ type: 'simple-json' })
  permissions: string[];

  @Column({ type: 'decimal', precision: 19, scale: 4, nullable: true })
  spendLimit?: string | null;

  @Column({ type: 'uuid', nullable: true })
  tenancyId?: string | null;
}

@Entity('manager_assignment_properties')
@Unique('uq_assignment_property', ['assignmentId', 'propertyId'])
export class ManagerAssignmentProperty extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  assignmentId: string;

  @Index()
  @Column({ type: 'uuid' })
  propertyId: string;
}

@Entity('tenancy_agreements')
export class TenancyAgreement extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  tenancyId: string;

  @Index()
  @Column({ type: 'uuid' })
  propertyId: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar', length: 16, default: AgreementStatus.DRAFT })
  status: AgreementStatus;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  expiryDate: string;

  @Column({ type: 'decimal', precision: 19, scale: 4 })
  monthlyRent: string;

  @Column({ type: 'varchar', length: 3 })
  currencyCode: string;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 0 })
  securityDeposit: string;

  @Column({ type: 'int' })
  rentDueDay: number;

  @Column({ type: 'text', nullable: true })
  renewalTerms?: string | null;

  @Column({ type: 'text', nullable: true })
  additionalTerms?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  documentStorageKey?: string | null;

  @Column({ type: 'uuid' })
  createdByUserId: string;
}

@Entity('agreement_renewals')
export class AgreementRenewal extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  tenancyId: string;

  @Column({ type: 'uuid' })
  previousAgreementId: string;

  @Column({ type: 'uuid' })
  newAgreementId: string;

  @Column({ type: 'int', nullable: true })
  years?: number | null;

  @Column({ type: 'date' })
  newExpiryDate: string;

  @Column({ type: 'varchar', length: 16, default: RenewalStatus.ACTIVE })
  status: RenewalStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  documentStorageKey?: string | null;

  @Column({ type: 'uuid' })
  createdByUserId: string;
}
