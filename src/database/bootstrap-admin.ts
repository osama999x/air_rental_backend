import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ALL_ADMIN_PERMISSIONS } from '../common/constants/permissions';
import { AdminStatus } from '../common/enums';
import { PasswordHashUtil } from '../common/utils/password-hash.util';
import { normalizeEmail } from '../common/utils/email.util';
import { AdminAccount, AdminRole, AdminRoleAssignment } from './entities';
import { AppModule } from '../app.module';

async function bootstrap() {
  const logger = new Logger('AdminBootstrap');
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters');
  }
  if (process.env.NODE_ENV === 'production' && process.env.ADMIN_BOOTSTRAP_CONFIRM !== 'yes') {
    throw new Error('Refusing to bootstrap an admin in production without ADMIN_BOOTSTRAP_CONFIRM=yes');
  }
  const app = await NestFactory.createApplicationContext(AppModule);
  const admins = app.get<Repository<AdminAccount>>(getRepositoryToken(AdminAccount));
  const roles = app.get<Repository<AdminRole>>(getRepositoryToken(AdminRole));
  const links = app.get<Repository<AdminRoleAssignment>>(getRepositoryToken(AdminRoleAssignment));
  let role = await roles.findOne({ where: { code: 'SUPERADMIN' } });
  if (!role) {
    role = await roles.save(roles.create({
      code: 'SUPERADMIN',
      name: 'Super admin',
      permissions: ALL_ADMIN_PERMISSIONS,
    }));
  }
  const support = await roles.findOne({ where: { code: 'SUPPORT' } });
  if (!support) {
    await roles.save(roles.create({
      code: 'SUPPORT',
      name: 'Support',
      permissions: ['USERS_READ', 'ORGS_READ', 'SUPPORT_READ', 'SUPPORT_MANAGE', 'INTEGRATIONS_READ'],
    }));
  }
  const normalized = normalizeEmail(email);
  let admin = await admins.findOne({ where: { email: normalized } });
  if (!admin) {
    admin = await admins.save(admins.create({
      email: normalized,
      passwordHash: await PasswordHashUtil.hash(password),
      displayName: process.env.ADMIN_NAME || 'Platform Admin',
      status: AdminStatus.ACTIVE,
      mfaEnabled: false,
    }));
    logger.log(`Created admin ${normalized}. MFA enrollment is required on first login.`);
  } else {
    logger.log('Admin already exists. No password was changed.');
  }
  const existing = await links.findOne({ where: { adminId: admin.id, roleId: role.id } });
  if (!existing) {
    await links.save(links.create({ adminId: admin.id, roleId: role.id }));
  }
  await app.close();
}

bootstrap().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
