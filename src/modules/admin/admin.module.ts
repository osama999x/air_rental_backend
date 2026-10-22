import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    AdminAccount,
    AdminRole,
    AdminRoleAssignment,
    RefreshToken,
    User,
    UserRole,
    Organization,
    Property,
    Tenancy,
    Subscription,
    UtilityProvider,
    IntegrationExecution,
    SupportTicket,
    AuditLog,
    PlatformSetting,
  ])],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
