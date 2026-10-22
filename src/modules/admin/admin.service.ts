import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, MoreThan, Repository } from 'typeorm';
import { AdminPermissionKey } from '../../common/constants/permissions';
import {
  AdminStatus,
  SubscriptionStatus,
  TenancyStatus,
  TokenAudience,
  UserStatus,
} from '../../common/enums';
import { JwtCustomService } from '../../common/providers/jwt.service';
import { PasswordHashUtil } from '../../common/utils/password-hash.util';
import { addDays } from '../../common/utils/dates.util';
import { randomToken, sha256 } from '../../common/utils/tokens.util';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../../common/utils/totp.util';
import {
  AdminAccount,
  AdminRole,
  AdminRoleAssignment,
  AuditLog,
  IntegrationExecution,
  Organization,
  PlatformSetting,
  Property,
  RefreshToken,
  Subscription,
  SupportTicket,
  Tenancy,
  User,
  UserRole,
  UtilityProvider,
} from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { JobsService } from '../jobs/jobs.service';
import { PortalRole } from '../../common/enums';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AdminAccount) private readonly admins: Repository<AdminAccount>,
    @InjectRepository(AdminRole) private readonly roles: Repository<AdminRole>,
    @InjectRepository(AdminRoleAssignment) private readonly roleLinks: Repository<AdminRoleAssignment>,
    @InjectRepository(RefreshToken) private readonly tokens: Repository<RefreshToken>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserRole) private readonly userRoles: Repository<UserRole>,
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(Tenancy) private readonly tenancies: Repository<Tenancy>,
    @InjectRepository(Subscription) private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(UtilityProvider) private readonly providers: Repository<UtilityProvider>,
    @InjectRepository(IntegrationExecution) private readonly executions: Repository<IntegrationExecution>,
    @InjectRepository(SupportTicket) private readonly tickets: Repository<SupportTicket>,
    @InjectRepository(AuditLog) private readonly auditLogs: Repository<AuditLog>,
    @InjectRepository(PlatformSetting) private readonly settings: Repository<PlatformSetting>,
    private readonly jwt: JwtCustomService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
  ) {}

  async login(email: string, password: string, meta: { ip?: string; userAgent?: string }) {
    const admin = await this.admins
      .createQueryBuilder('admin')
      .addSelect('admin.passwordHash')
      .addSelect('admin.mfaSecret')
      .where('admin.email = :email', { email: email.trim().toLowerCase() })
      .getOne();
    if (!admin || admin.status !== AdminStatus.ACTIVE) throw new UnauthorizedException('Admin credentials are invalid');
    const valid = await PasswordHashUtil.validatePassword(password, admin.passwordHash);
    if (!valid) throw new UnauthorizedException('Admin credentials are invalid');
    if (!admin.mfaEnabled) {
      const secret = generateTotpSecret();
      await this.admins.update({ id: admin.id }, { mfaSecret: secret });
      const setupToken = await this.jwt.signAccess({ sub: admin.id, aud: 'admin-mfa-setup' }, 600);
      return {
        mfaSetupRequired: true,
        setupToken,
        otpauthUrl: otpauthUrl(secret, admin.email),
      };
    }
    const mfaToken = await this.jwt.signAccess({ sub: admin.id, aud: 'admin-mfa' }, 300);
    return { mfaRequired: true, mfaToken };
  }

  async confirmMfa(token: string, code: string, meta: { ip?: string; userAgent?: string }) {
    const payload = await this.jwt.verifyAccess(token);
    const admin = await this.admins.createQueryBuilder('admin').addSelect('admin.mfaSecret').where('admin.id = :id', { id: payload.sub }).getOne();
    if (!admin?.mfaSecret || !verifyTotp(admin.mfaSecret, code)) {
      throw new UnauthorizedException('MFA code is invalid');
    }
    if (payload.aud === 'admin-mfa-setup') {
      await this.admins.update({ id: admin.id }, { mfaEnabled: true });
    }
    return this.issue(admin, meta);
  }

  async dashboard(adminId: string) {
    await this.assert(adminId, 'ANALYTICS_READ');
    const since = addDays(new Date(), -1);
    const [totalUsers, activeOwners, activeTenants, managers, properties, activeTenancies, activeSubscriptions, jobCounts, platformErrors] = await Promise.all([
      this.users.count(),
      this.countRole(PortalRole.OWNER),
      this.countRole(PortalRole.TENANT),
      this.countRole(PortalRole.MANAGER),
      this.properties.count(),
      this.tenancies.count({ where: { status: TenancyStatus.ACTIVE } }),
      this.subscriptions.count({ where: { status: SubscriptionStatus.ACTIVE } }),
      this.jobs.counts(),
      this.executions.count({ where: { status: 'FAILED', createdAt: MoreThan(since) } }),
    ]);
    return {
      totalUsers,
      activeOwners,
      activeTenants,
      managers,
      properties,
      activeTenancies,
      activeSubscriptions,
      overdueIntegrationJobs: jobCounts.dead,
      pendingJobs: jobCounts.pending,
      platformErrors,
      definitions: {
        totalUsers: 'All user rows, including deactivated accounts.',
        activeOwners: 'Active users who hold the owner role.',
        activeTenants: 'Active users who hold the tenant role.',
        managers: 'Active users who hold the manager role.',
        properties: 'All property rows, including archived properties.',
        activeTenancies: 'Tenancies with status ACTIVE.',
        activeSubscriptions: 'Subscriptions with status ACTIVE. Trials are excluded.',
        overdueIntegrationJobs: 'Scheduled jobs in the DEAD state.',
        platformErrors: 'Integration executions marked FAILED in the last 24 hours.',
      },
    };
  }

  async usersList(adminId: string, search?: string, page = 1, pageSize = 20) {
    await this.assert(adminId, 'USERS_READ');
    const [items, total] = await this.users.findAndCount({
      where: search ? [{ email: ILike(`%${search}%`) }, { firstName: ILike(`%${search}%`) }] : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total, page, pageSize };
  }

  async setUserStatus(adminId: string, userId: string, status: UserStatus, reason: string) {
    await this.assert(adminId, 'USERS_SUSPEND');
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User was not found');
    await this.users.update({ id: userId }, { status });
    if (status === UserStatus.SUSPENDED || status === UserStatus.DEACTIVATED) {
      await this.tokens.update({ userId }, { revokedAt: new Date() });
    }
    await this.audit.record({
      actorAdminId: adminId,
      actorType: 'ADMIN',
      action: 'admin.user_status',
      entityType: 'user',
      entityId: userId,
      metadata: { status, reason },
    });
    return { id: userId, status };
  }

  async listOrganizations(adminId: string, page = 1) {
    await this.assert(adminId, 'ORGS_READ');
    const [items, total] = await this.organizations.findAndCount({ skip: (page - 1) * 20, take: 20 });
    return { items, total, page, pageSize: 20 };
  }

  async listProperties(adminId: string, page = 1) {
    await this.assert(adminId, 'PROPERTIES_READ');
    const [items, total] = await this.properties.findAndCount({
      select: ['id', 'visibleCode', 'name', 'propertyType', 'status', 'countryId', 'cityId', 'ownerUserId', 'createdAt'],
      skip: (page - 1) * 20,
      take: 20,
    });
    return { items, total, page, pageSize: 20 };
  }

  async subscriptionList(adminId: string) {
    await this.assert(adminId, 'SUBSCRIPTIONS_READ');
    return this.subscriptions.find({ order: { createdAt: 'DESC' }, take: 100 });
  }

  async providerList(adminId: string) {
    await this.assert(adminId, 'PROVIDERS_READ');
    return this.providers.find();
  }

  async integrations(adminId: string) {
    await this.assert(adminId, 'INTEGRATIONS_READ');
    const jobs = await this.jobs.counts();
    const failures = await this.executions.find({ where: { status: 'FAILED' }, order: { createdAt: 'DESC' }, take: 50 });
    return { jobs, failures };
  }

  async support(adminId: string) {
    await this.assert(adminId, 'SUPPORT_READ');
    return this.tickets.find({ order: { createdAt: 'DESC' }, take: 100 });
  }

  async searchAudit(adminId: string, page = 1) {
    await this.assert(adminId, 'AUDIT_READ');
    const [items, total] = await this.auditLogs.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * 50,
      take: 50,
    });
    return { items, total, page, pageSize: 50 };
  }

  async updateSetting(adminId: string, key: string, value: string | number | boolean) {
    await this.assert(adminId, 'SETTINGS_MANAGE');
    await this.settings.save(this.settings.create({ key, value, updatedAt: new Date() }));
    await this.audit.record({
      actorAdminId: adminId,
      actorType: 'ADMIN',
      action: 'admin.setting_updated',
      entityType: 'platform_setting',
      entityId: key,
    });
    return { key, value };
  }

  async settingsList(adminId: string) {
    await this.assert(adminId, 'SETTINGS_READ');
    return this.settings.find();
  }

  private async issue(admin: AdminAccount, meta: { ip?: string; userAgent?: string }) {
    const raw = randomToken(48);
    await this.tokens.save(this.tokens.create({
      adminId: admin.id,
      audience: TokenAudience.ADMIN,
      tokenHash: sha256(raw),
      familyId: randomToken(16),
      expiresAt: addDays(new Date(), 7),
      userAgent: meta.userAgent,
      ipAddress: meta.ip,
    }));
    const accessToken = await this.jwt.signAccess({ sub: admin.id, aud: 'admin' }, 900);
    return { accessToken, refreshToken: raw, admin: { id: admin.id, email: admin.email, displayName: admin.displayName } };
  }

  private async countRole(role: PortalRole) {
    const rows = await this.userRoles.find({ where: { role } });
    if (!rows.length) return 0;
    return this.users.count({ where: rows.map((row) => ({ id: row.userId, status: UserStatus.ACTIVE })) as any });
  }

  private async assert(adminId: string, permission: AdminPermissionKey) {
    const links = await this.roleLinks.find({ where: { adminId } });
    const roles = links.length
      ? await this.roles.find({ where: { id: In(links.map((link) => link.roleId)) } })
      : [];
    const allowed = roles.some((role) => role.permissions?.includes(permission));
    if (!allowed) throw new ForbiddenException('Admin permission is required');
  }
}
