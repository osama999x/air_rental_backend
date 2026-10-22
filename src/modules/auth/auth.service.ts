import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { OAuth2Client } from 'google-auth-library';
import { createVerify } from 'crypto';
import { MoreThan, Repository } from 'typeorm';
import {
  AuthIdentity,
  DeviceSession,
  LoginAttempt,
  ManagerProfile,
  OtpChallenge,
  OwnerProfile,
  RefreshToken,
  TenantProfile,
  User,
  UserRole,
} from '../../database/entities';
import {
  AccountCategory,
  AuthProvider,
  OtpChannel,
  OtpPurpose,
  PortalRole,
  TokenAudience,
  UserStatus,
} from '../../common/enums';
import { JwtCustomService } from '../../common/providers/jwt.service';
import { PasswordHashUtil } from '../../common/utils/password-hash.util';
import { normalizeEmail } from '../../common/utils/email.util';
import { randomDigits, randomToken, sha256 } from '../../common/utils/tokens.util';
import { addDays } from '../../common/utils/dates.util';
import { MailService } from '../notifications/mail.service';
import { AuditService } from '../audit/audit.service';
import { verifyAppleIdentityToken } from './apple.verifier';
import { resolveActiveRole } from '../access/access.policy';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AuthIdentity) private readonly identities: Repository<AuthIdentity>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(OtpChallenge) private readonly otps: Repository<OtpChallenge>,
    @InjectRepository(UserRole) private readonly roles: Repository<UserRole>,
    @InjectRepository(DeviceSession) private readonly devices: Repository<DeviceSession>,
    @InjectRepository(LoginAttempt) private readonly attempts: Repository<LoginAttempt>,
    @InjectRepository(OwnerProfile) private readonly owners: Repository<OwnerProfile>,
    @InjectRepository(TenantProfile) private readonly tenants: Repository<TenantProfile>,
    @InjectRepository(ManagerProfile) private readonly managers: Repository<ManagerProfile>,
    private readonly jwt: JwtCustomService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async register(input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    preferredLanguage?: string;
    timezone?: string;
  }) {
    const email = normalizeEmail(input.email);
    const existing = await this.users.findOne({ where: { email } });
    if (existing?.emailVerifiedAt) {
      throw new ConflictException('An account with this email already exists');
    }
    if (existing) {
      await this.users.update(
        { id: existing.id },
        {
          passwordHash: await PasswordHashUtil.hash(input.password),
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? existing.phone,
          preferredLanguage: input.preferredLanguage || existing.preferredLanguage || 'en',
          timezone: input.timezone || existing.timezone || 'UTC',
        },
      );
      await this.issueOtp(existing.id, email, OtpPurpose.VERIFY_EMAIL);
      await this.audit.record({
        actorUserId: existing.id,
        actorType: 'USER',
        action: 'auth.verification_resent',
        entityType: 'user',
        entityId: existing.id,
      });
      return { userId: existing.id, verificationRequired: true };
    }
    const user = await this.users.save(
      this.users.create({
        email,
        passwordHash: await PasswordHashUtil.hash(input.password),
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        preferredLanguage: input.preferredLanguage || 'en',
        timezone: input.timezone || 'UTC',
        status: UserStatus.ACTIVE,
      }),
    );
    await this.identities.save(
      this.identities.create({
        userId: user.id,
        provider: AuthProvider.LOCAL,
        providerSubject: user.id,
        email,
      }),
    );
    await this.issueOtp(user.id, email, OtpPurpose.VERIFY_EMAIL);
    await this.audit.record({
      actorUserId: user.id,
      actorType: 'USER',
      action: 'auth.register',
      entityType: 'user',
      entityId: user.id,
    });
    return { userId: user.id, verificationRequired: true };
  }

  async verifyEmail(email: string, code: string, meta: RequestMeta) {
    const user = await this.findByEmail(email);
    if (!user) throw new UnauthorizedException('Verification code is invalid');
    await this.consumeOtp(user.id, normalizeEmail(email), OtpPurpose.VERIFY_EMAIL, code);
    await this.users.update({ id: user.id }, { emailVerifiedAt: new Date() });
    user.emailVerifiedAt = new Date();
    return this.issueSession(user, meta);
  }

  async login(email: string, password: string, meta: RequestMeta) {
    const normalized = normalizeEmail(email);
    await this.assertNotLocked(normalized);
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: normalized })
      .getOne();
    const valid = user?.passwordHash
      ? await PasswordHashUtil.validatePassword(password, user.passwordHash)
      : false;
    await this.attempts.save(this.attempts.create({ email: normalized, ipAddress: meta.ip, success: valid }));
    if (!user || !valid) throw new UnauthorizedException('Email or password is incorrect');
    if (user.status !== UserStatus.ACTIVE && user.status !== UserStatus.PENDING_DELETION) {
      throw new UnauthorizedException('This account cannot sign in');
    }
    if (!user.emailVerifiedAt) {
      await this.issueOtp(user.id, user.email, OtpPurpose.VERIFY_EMAIL);
      throw new UnauthorizedException('Verify your email before signing in. A new code is on its way.');
    }
    return this.issueSession(user, meta);
  }

  async refresh(refreshToken: string, meta: RequestMeta) {
    let payload: any;
    try {
      payload = await this.jwt.verifyRefresh(refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token is invalid');
    }
    const tokenHash = sha256(refreshToken);
    const stored = await this.refreshTokens
      .createQueryBuilder('token')
      .addSelect('token.tokenHash')
      .where('token.tokenHash = :tokenHash', { tokenHash })
      .getOne();
    if (!stored || stored.audience !== TokenAudience.USER) {
      throw new UnauthorizedException('Refresh token is invalid');
    }
    if (stored.revokedAt) {
      await this.refreshTokens.update({ familyId: stored.familyId }, { revokedAt: new Date() });
      throw new UnauthorizedException('Refresh token was reused and the session family was revoked');
    }
    if (stored.expiresAt < new Date()) throw new UnauthorizedException('Refresh token has expired');
    const user = await this.users.findOne({ where: { id: stored.userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    const next = await this.createRefresh(user.id, stored.familyId, stored.deviceSessionId, meta);
    stored.revokedAt = new Date();
    stored.replacedByTokenId = next.id;
    await this.refreshTokens.save(stored);
    const accessToken = await this.jwt.signAccess({
      sub: user.id,
      sid: stored.deviceSessionId,
      aud: 'user',
    });
    return { accessToken, refreshToken: next.raw, user: this.publicUser(user) };
  }

  async logout(userId: string, sessionId?: string) {
    if (sessionId) {
      await this.refreshTokens.update({ deviceSessionId: sessionId, userId }, { revokedAt: new Date() });
      await this.devices.update({ id: sessionId, userId }, { revokedAt: new Date() });
    }
    return { loggedOut: true };
  }

  async logoutAll(userId: string) {
    await this.refreshTokens.update({ userId }, { revokedAt: new Date() });
    await this.devices.update({ userId }, { revokedAt: new Date() });
    return { loggedOut: true };
  }

  async forgotPassword(email: string) {
    const user = await this.findByEmail(email);
    if (user) await this.issueOtp(user.id, user.email, OtpPurpose.RESET_PASSWORD);
    return { accepted: true };
  }

  async resendVerification(email: string) {
    const user = await this.findByEmail(email);
    if (user && !user.emailVerifiedAt) {
      await this.issueOtp(user.id, user.email, OtpPurpose.VERIFY_EMAIL);
    }
    return { accepted: true };
  }

  async resetPassword(email: string, code: string, password: string) {
    const user = await this.findByEmail(email);
    if (!user) throw new UnauthorizedException('Reset code is invalid');
    await this.consumeOtp(user.id, user.email, OtpPurpose.RESET_PASSWORD, code);
    await this.users.update({ id: user.id }, { passwordHash: await PasswordHashUtil.hash(password) });
    await this.logoutAll(user.id);
    await this.audit.record({
      actorUserId: user.id,
      actorType: 'USER',
      action: 'auth.password_reset',
      entityType: 'user',
      entityId: user.id,
    });
    return { reset: true };
  }

  async google(idToken: string, meta: RequestMeta, names?: { firstName?: string; lastName?: string }) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) throw new ServiceUnavailableException('Google sign-in is not configured');
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw new UnauthorizedException('Google token did not include an email');
    return this.linkOrCreate(
      {
        provider: AuthProvider.GOOGLE,
        subject: payload.sub,
        email: payload.email,
        emailVerified: Boolean(payload.email_verified),
        firstName: names?.firstName || payload.given_name || 'Google',
        lastName: names?.lastName || payload.family_name || 'User',
      },
      meta,
    );
  }

  async apple(idToken: string, meta: RequestMeta, names?: { firstName?: string; lastName?: string }) {
    const clientId = this.config.get<string>('APPLE_CLIENT_ID');
    if (!clientId) throw new ServiceUnavailableException('Apple sign-in is not configured');
    let identity;
    try {
      identity = await verifyAppleIdentityToken(idToken, clientId);
    } catch {
      throw new UnauthorizedException('Apple identity token could not be verified');
    }
    if (!identity.email) {
      const existing = await this.identities.findOne({
        where: { provider: AuthProvider.APPLE, providerSubject: identity.sub },
      });
      if (!existing) throw new UnauthorizedException('Apple did not return an email for a new account');
      const user = await this.users.findOne({ where: { id: existing.userId } });
      if (!user) throw new UnauthorizedException('Linked account was not found');
      return this.issueSession(user, meta);
    }
    return this.linkOrCreate(
      {
        provider: AuthProvider.APPLE,
        subject: identity.sub,
        email: identity.email,
        emailVerified: identity.email_verified === true || identity.email_verified === 'true',
        firstName: names?.firstName || 'Apple',
        lastName: names?.lastName || 'User',
      },
      meta,
    );
  }

  async sessions(userId: string) {
    return this.devices.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      select: ['id', 'deviceName', 'platform', 'activeRole', 'lastSeenAt', 'revokedAt', 'createdAt'],
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.devices.update({ id: sessionId, userId }, { revokedAt: new Date() });
    await this.refreshTokens.update({ deviceSessionId: sessionId, userId }, { revokedAt: new Date() });
    return { revoked: true };
  }

  async setActiveRole(user: User, role: PortalRole) {
    const held = (await this.roles.find({ where: { userId: user.id } })).map((item) => item.role);
    try {
      resolveActiveRole(held, role);
    } catch {
      throw new BadRequestException('That portal role is not assigned to this account');
    }
    await this.users.update({ id: user.id }, { preferredPortalRole: role });
    user.preferredPortalRole = role;
    return { activeRole: role, roles: held };
  }

  async listRoles(userId: string) {
    const roles = (await this.roles.find({ where: { userId } })).map((role) => role.role);
    const user = await this.users.findOne({ where: { id: userId } });
    return { roles, preferredPortalRole: user?.preferredPortalRole || null };
  }

  async grantRole(user: User, role: PortalRole) {
    if (![PortalRole.OWNER, PortalRole.TENANT, PortalRole.MANAGER].includes(role)) {
      throw new BadRequestException('Only public portal roles can be added');
    }
    const existing = await this.roles.findOne({ where: { userId: user.id, role } });
    if (!existing) {
      await this.roles.save(this.roles.create({ userId: user.id, role }));
    }
    const displayName = `${user.firstName} ${user.lastName}`.trim();
    if (role === PortalRole.OWNER && !(await this.owners.findOne({ where: { userId: user.id } }))) {
      await this.owners.save(this.owners.create({
        userId: user.id,
        displayName,
        category: AccountCategory.INDIVIDUAL,
      }));
    }
    if (role === PortalRole.TENANT && !(await this.tenants.findOne({ where: { userId: user.id } }))) {
      await this.tenants.save(this.tenants.create({
        userId: user.id,
        displayName,
        category: AccountCategory.INDIVIDUAL,
      }));
    }
    if (role === PortalRole.MANAGER && !(await this.managers.findOne({ where: { userId: user.id } }))) {
      await this.managers.save(this.managers.create({ userId: user.id, displayName }));
    }
    if (!user.preferredPortalRole) {
      user.preferredPortalRole = role;
      await this.users.update({ id: user.id }, { preferredPortalRole: role });
    }
    await this.audit.record({
      actorUserId: user.id,
      actorType: 'USER',
      action: 'user.role_granted',
      entityType: 'user',
      entityId: user.id,
      activeRole: role,
    });
    return this.listRoles(user.id);
  }

  async registerBiometricKey(userId: string, sessionId: string, publicKey: string) {
    const session = await this.devices.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new BadRequestException('Device session was not found');
    await this.devices.update({ id: session.id }, { biometricPublicKey: publicKey });
    return { registered: true };
  }

  async biometricChallenge(deviceSessionId: string) {
    const session = await this.devices.findOne({ where: { id: deviceSessionId } });
    if (!session?.biometricPublicKey || session.revokedAt) {
      throw new UnauthorizedException('Biometric login is not registered for this device');
    }
    const challenge = randomToken(32);
    await this.devices.update(
      { id: session.id },
      {
        biometricChallenge: challenge,
        biometricChallengeExpiresAt: new Date(Date.now() + 2 * 60 * 1000),
      },
    );
    return { challenge };
  }

  async biometricVerify(deviceSessionId: string, signature: string, meta: RequestMeta) {
    const session = await this.devices
      .createQueryBuilder('device')
      .addSelect('device.biometricPublicKey')
      .addSelect('device.biometricChallenge')
      .where('device.id = :id', { id: deviceSessionId })
      .getOne();
    if (!session?.biometricPublicKey || !session.biometricChallenge) {
      throw new UnauthorizedException('Biometric login is not registered');
    }
    if (!session.biometricChallengeExpiresAt || session.biometricChallengeExpiresAt < new Date()) {
      throw new UnauthorizedException('Biometric challenge has expired');
    }
    const verifier = createVerify('SHA256');
    verifier.update(session.biometricChallenge);
    verifier.end();
    let valid = false;
    try {
      valid = verifier.verify(session.biometricPublicKey, Buffer.from(signature, 'base64'));
    } catch {
      valid = false;
    }
    await this.devices.update(
      { id: session.id },
      { biometricChallenge: null, biometricChallengeExpiresAt: null },
    );
    if (!valid) throw new UnauthorizedException('Biometric signature is invalid');
    const user = await this.users.findOne({ where: { id: session.userId } });
    if (!user) throw new UnauthorizedException('Account was not found');
    return this.issueSession(user, { ...meta, deviceName: session.deviceName || undefined, platform: session.platform || undefined });
  }

  async deactivate(user: User) {
    user.status = UserStatus.DEACTIVATED;
    await this.users.update({ id: user.id }, { status: UserStatus.DEACTIVATED });
    await this.logoutAll(user.id);
    await this.audit.record({
      actorUserId: user.id,
      actorType: 'USER',
      action: 'user.deactivated',
      entityType: 'user',
      entityId: user.id,
    });
    return { status: user.status };
  }

  async requestDeletion(user: User) {
    user.status = UserStatus.PENDING_DELETION;
    user.deletionRequestedAt = new Date();
    await this.users.update(
      { id: user.id },
      { status: UserStatus.PENDING_DELETION, deletionRequestedAt: user.deletionRequestedAt },
    );
    await this.logoutAll(user.id);
    await this.audit.record({
      actorUserId: user.id,
      actorType: 'USER',
      action: 'user.deletion_requested',
      entityType: 'user',
      entityId: user.id,
    });
    return { status: user.status };
  }

  private async linkOrCreate(
    input: {
      provider: AuthProvider;
      subject: string;
      email: string;
      emailVerified: boolean;
      firstName: string;
      lastName: string;
    },
    meta: RequestMeta,
  ) {
    const email = normalizeEmail(input.email);
    const identity = await this.identities.findOne({
      where: { provider: input.provider, providerSubject: input.subject },
    });
    if (identity) {
      const user = await this.users.findOne({ where: { id: identity.userId } });
      if (!user) throw new UnauthorizedException('Linked account was not found');
      return this.issueSession(user, meta);
    }
    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      if (!input.emailVerified && !existing.emailVerifiedAt) {
        throw new ConflictException('Verify the existing account before linking this identity');
      }
      await this.identities.save(
        this.identities.create({
          userId: existing.id,
          provider: input.provider,
          providerSubject: input.subject,
          email,
        }),
      );
      if (!existing.emailVerifiedAt && input.emailVerified) {
        existing.emailVerifiedAt = new Date();
        await this.users.update({ id: existing.id }, { emailVerifiedAt: existing.emailVerifiedAt });
      }
      await this.audit.record({
        actorUserId: existing.id,
        actorType: 'USER',
        action: 'auth.identity_linked',
        entityType: 'auth_identity',
        entityId: existing.id,
        metadata: { provider: input.provider },
      });
      return this.issueSession(existing, meta);
    }
    const created = await this.users.save(
      this.users.create({
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        emailVerifiedAt: input.emailVerified ? new Date() : null,
        status: UserStatus.ACTIVE,
      }),
    );
    await this.identities.save(
      this.identities.create({
        userId: created.id,
        provider: input.provider,
        providerSubject: input.subject,
        email,
      }),
    );
    return this.issueSession(created, meta);
  }

  private async issueSession(user: User, meta: RequestMeta) {
    const device = await this.devices.save(
      this.devices.create({
        userId: user.id,
        deviceName: meta.deviceName,
        platform: meta.platform,
        pushToken: meta.pushToken,
        activeRole: user.preferredPortalRole,
        lastSeenAt: new Date(),
      }),
    );
    const familyId = randomToken(16);
    const refresh = await this.createRefresh(user.id, familyId, device.id, meta);
    const accessToken = await this.jwt.signAccess({ sub: user.id, sid: device.id, aud: 'user' });
    const roles = (await this.roles.find({ where: { userId: user.id } })).map((role) => role.role);
    return {
      accessToken,
      refreshToken: refresh.raw,
      user: this.publicUser(user),
      roles,
      sessionId: device.id,
    };
  }

  private async createRefresh(userId: string, familyId: string, deviceSessionId: string | null | undefined, meta: RequestMeta) {
    const raw = randomToken(48);
    const saved = await this.refreshTokens.save(
      this.refreshTokens.create({
        userId,
        audience: TokenAudience.USER,
        tokenHash: sha256(raw),
        familyId,
        deviceSessionId: deviceSessionId || null,
        expiresAt: addDays(new Date(), 30),
        userAgent: meta.userAgent,
        ipAddress: meta.ip,
      }),
    );
    return { ...saved, raw };
  }

  async sendPhoneCode(user: User, phone: string) {
    const destination = this.normalizePhone(phone);
    const taken = await this.users.findOne({ where: { phone: destination } });
    if (taken && taken.id !== user.id && taken.phoneVerifiedAt) {
      throw new ConflictException('That phone number is already verified on another account');
    }
    await this.storeOtp(user.id, destination, OtpPurpose.VERIFY_PHONE, OtpChannel.SMS);
    const configured = Boolean(this.config.get('SMS_PROVIDER') && this.config.get('SMS_API_KEY'));
    return {
      phone: destination,
      sent: false,
      reason: configured ? 'SMS_PROVIDER_NOT_CONFIGURED' : 'SMS_NOT_CONFIGURED',
    };
  }

  async verifyPhoneCode(user: User, phone: string, code: string) {
    const destination = this.normalizePhone(phone);
    await this.consumeOtp(user.id, destination, OtpPurpose.VERIFY_PHONE, code);
    user.phone = destination;
    user.phoneVerifiedAt = new Date();
    await this.users.save(user);
    return this.publicUser(user);
  }

  private normalizePhone(phone: string) {
    const compact = phone.trim().replace(/[\s()-]/g, '');
    if (!/^\+?[0-9]{8,15}$/.test(compact)) {
      throw new BadRequestException('Enter a valid phone number');
    }
    return compact;
  }

  private async issueOtp(userId: string, destination: string, purpose: OtpPurpose) {
    const recent = await this.otps.findOne({
      where: { userId, destination, purpose },
      order: { createdAt: 'DESC' },
    });
    if (recent && Date.now() - new Date(recent.createdAt).getTime() < 60_000) return;
    const code = await this.storeOtp(userId, destination, purpose, OtpChannel.EMAIL);
    const reset = purpose === OtpPurpose.RESET_PASSWORD;
    const subject = reset ? 'Reset your Air Rental password' : 'Verify your Air Rental email';
    const text = reset
      ? `Use this code to choose a new password.\nIt expires in 10 minutes.\n${code}\nIf you did not ask for this email, you can ignore it.`
      : `Use this code to verify your email and open your account.\nIt expires in 10 minutes.\n${code}\nIf you did not create an Air Rental account, you can ignore this email.`;
    const sent = await this.mail.send(destination, subject, text, { code });
    if (!sent.delivered) {
      await this.otps.delete({ userId, destination, purpose, codeHash: sha256(code) });
      throw new ServiceUnavailableException('The verification email could not be sent. Try again in a minute.');
    }
  }

  private async storeOtp(userId: string, destination: string, purpose: OtpPurpose, channel: OtpChannel) {
    const code = randomDigits(6);
    await this.otps.save(
      this.otps.create({
        userId,
        destination,
        channel,
        purpose,
        codeHash: sha256(code),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
      }),
    );
    return code;
  }

  private async consumeOtp(userId: string, destination: string, purpose: OtpPurpose, code: string) {
    const challenge = await this.otps
      .createQueryBuilder('otp')
      .addSelect('otp.codeHash')
      .where('otp.userId = :userId AND otp.destination = :destination AND otp.purpose = :purpose', {
        userId,
        destination,
        purpose,
      })
      .andWhere('otp.consumedAt IS NULL')
      .orderBy('otp.createdAt', 'DESC')
      .getOne();
    if (!challenge || challenge.expiresAt < new Date()) {
      throw new UnauthorizedException('Verification code is invalid or expired');
    }
    if (challenge.attempts >= 5) throw new HttpException('Too many attempts', HttpStatus.TOO_MANY_REQUESTS);
    challenge.attempts += 1;
    if (challenge.codeHash !== sha256(code)) {
      await this.otps.save(challenge);
      throw new UnauthorizedException('Verification code is invalid or expired');
    }
    challenge.consumedAt = new Date();
    await this.otps.save(challenge);
  }

  private async assertNotLocked(email: string) {
    const since = new Date(Date.now() - 15 * 60 * 1000);
    const recent = await this.attempts.count({
      where: { email, success: false, createdAt: MoreThan(since) },
    });
    if (recent >= 8) throw new HttpException('Too many sign-in attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
  }

  private findByEmail(email: string) {
    return this.users.findOne({ where: { email: normalizeEmail(email) } });
  }

  private publicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      emailVerifiedAt: user.emailVerifiedAt,
      phoneVerifiedAt: user.phoneVerifiedAt,
      preferredLanguage: user.preferredLanguage,
      timezone: user.timezone,
      status: user.status,
      preferredPortalRole: user.preferredPortalRole,
      mfaEnabled: user.mfaEnabled,
    };
  }
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
  deviceName?: string;
  platform?: string;
  pushToken?: string;
}
