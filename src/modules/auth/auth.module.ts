import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortalContextGuard } from '../../common/guards/portal-context.guard';
import {
  AdminAccount,
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
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      AuthIdentity,
      RefreshToken,
      OtpChallenge,
      UserRole,
      DeviceSession,
      LoginAttempt,
      OwnerProfile,
      TenantProfile,
      ManagerProfile,
      AdminAccount,
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PortalContextGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
