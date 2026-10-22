import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { AdminStatus, JobStatus, SupportStatus } from '../../common/enums';
import { BaseEntity, CreatedEntity } from './base.entity';

@Entity('audit_logs')
export class AuditLog extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid', nullable: true })
  actorUserId?: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  actorAdminId?: string | null;

  @Column({ type: 'varchar', length: 16 })
  actorType: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  activeRole?: string | null;

  @Index()
  @Column({ type: 'varchar', length: 80 })
  action: string;

  @Column({ type: 'varchar', length: 64 })
  entityType: string;

  @Column({ type: 'varchar', length: 64 })
  entityId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  propertyId?: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  tenancyId?: string | null;

  @Column({ type: 'varchar', length: 16 })
  outcome: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  requestId?: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, string | number | boolean | null> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress?: string | null;
}

@Entity('ai_extractions')
export class AiExtraction extends CreatedEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 32 })
  sourceType: string;

  @Column({ type: 'uuid' })
  sourceId: string;

  @Column({ type: 'simple-json' })
  fields: Record<string, string | number | null>;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  confidence: string;

  @Column({ default: false })
  verified: boolean;

  @Column({ type: 'uuid', nullable: true })
  verifiedByUserId?: string | null;
}

@Entity('support_tickets')
export class SupportTicket extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId?: string | null;

  @Column({ type: 'varchar', length: 180 })
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 16, default: SupportStatus.OPEN })
  status: SupportStatus;

  @Column({ type: 'varchar', length: 16, default: 'NORMAL' })
  priority: string;
}

@Entity('integration_configurations')
export class IntegrationConfiguration extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ default: false })
  enabled: boolean;

  @Column({ type: 'varchar', length: 32, default: 'NOT_CONFIGURED' })
  status: string;

  @Column({ type: 'simple-json', nullable: true })
  publicConfig?: Record<string, string | boolean | null> | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastCheckedAt?: Date | null;
}

@Entity('integration_executions')
export class IntegrationExecution extends CreatedEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  integrationCode: string;

  @Column({ type: 'varchar', length: 64 })
  operation: string;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  errorMessage?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt?: Date | null;
}

@Entity('platform_settings')
export class PlatformSetting {
  @PrimaryColumn({ type: 'varchar', length: 80 })
  key: string;

  @Column({ type: 'simple-json' })
  value: string | number | boolean;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

@Entity('scheduled_jobs')
export class ScheduledJob extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  type: string;

  @Column({ type: 'simple-json' })
  payload: Record<string, string | number | boolean | null>;

  @Index()
  @Column({ type: 'timestamptz' })
  runAt: Date;

  @Index()
  @Column({ type: 'varchar', length: 16, default: JobStatus.PENDING })
  status: JobStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'int', default: 5 })
  maxAttempts: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 180, nullable: true })
  dedupeKey?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastError?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lockedAt?: Date | null;
}

@Entity('idempotency_records')
export class IdempotencyRecord extends CreatedEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 160 })
  key: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 128 })
  requestHash: string;

  @Column({ type: 'int' })
  responseStatus: number;

  @Column({ type: 'simple-json', nullable: true })
  responseBody?: Record<string, unknown> | null;
}

@Entity('admin_accounts')
export class AdminAccount extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 120 })
  displayName: string;

  @Column({ type: 'varchar', length: 16, default: AdminStatus.ACTIVE })
  status: AdminStatus;

  @Column({ default: false })
  mfaEnabled: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true, select: false })
  mfaSecret?: string | null;
}

@Entity('admin_roles')
export class AdminRole extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'simple-json' })
  permissions: string[];
}

@Entity('admin_role_assignments')
@Index('uq_admin_role', ['adminId', 'roleId'], { unique: true })
export class AdminRoleAssignment extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  adminId: string;

  @Column({ type: 'uuid' })
  roleId: string;
}
