import { Column, Entity, Index, Unique } from 'typeorm';
import {
  AuthProvider,
  OtpChannel,
  OtpPurpose,
  PortalRole,
  TokenAudience,
  UserStatus,
} from '../../common/enums';
import { BaseEntity, CreatedEntity } from './base.entity';

@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt?: Date | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  phoneVerifiedAt?: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  passwordHash?: string | null;

  @Column({ type: 'varchar', length: 120 })
  firstName: string;

  @Column({ type: 'varchar', length: 120 })
  lastName: string;

  @Column({ type: 'varchar', length: 12, default: 'en' })
  preferredLanguage: string;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone: string;

  @Column({ type: 'varchar', length: 32, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ type: 'timestamptz', nullable: true })
  deletionRequestedAt?: Date | null;

  @Column({ default: false })
  mfaEnabled: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true, select: false })
  mfaSecret?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  preferredPortalRole?: PortalRole | null;
}

@Entity('auth_identities')
@Unique('uq_identity_provider_subject', ['provider', 'providerSubject'])
export class AuthIdentity extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16 })
  provider: AuthProvider;

  @Column({ type: 'varchar', length: 255 })
  providerSubject: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;
}

@Entity('refresh_tokens')
export class RefreshToken extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId?: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  adminId?: string | null;

  @Column({ type: 'varchar', length: 16 })
  audience: TokenAudience;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, select: false })
  tokenHash: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  familyId: string;

  @Column({ type: 'uuid', nullable: true })
  deviceSessionId?: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  replacedByTokenId?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress?: string | null;
}

@Entity('otp_challenges')
export class OtpChallenge extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId?: string | null;

  @Column({ type: 'varchar', length: 255 })
  destination: string;

  @Column({ type: 'varchar', length: 16 })
  channel: OtpChannel;

  @Column({ type: 'varchar', length: 32 })
  purpose: OtpPurpose;

  @Column({ type: 'varchar', length: 128, select: false })
  codeHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt?: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;
}

@Entity('user_roles')
@Unique('uq_user_role', ['userId', 'role'])
export class UserRole extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16 })
  role: PortalRole;
}

@Entity('device_sessions')
export class DeviceSession extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  deviceName?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  platform?: string | null;

  @Column({ type: 'text', nullable: true, select: false })
  biometricPublicKey?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true, select: false })
  biometricChallenge?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  biometricChallengeExpiresAt?: Date | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  activeRole?: PortalRole | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pushToken?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt?: Date | null;
}

@Entity('login_attempts')
export class LoginAttempt extends CreatedEntity {
  @Index()
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress?: string | null;

  @Column({ default: false })
  success: boolean;
}
