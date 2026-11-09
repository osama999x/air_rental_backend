import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { City, InsurancePolicy, Invitation, OwnerProfile, Property, PropertyMedia, Tenancy, TenancyAgreement, TenantProfile, User } from '../../database/entities';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { TenanciesController } from './tenancies.controller';
import { TenanciesService } from './tenancies.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenancy, Invitation, Property, PropertyMedia, City, User, InsurancePolicy, TenancyAgreement, OwnerProfile, TenantProfile]),
    AuthModule,
    UsersModule,
  ],
  controllers: [TenanciesController],
  providers: [TenanciesService],
  exports: [TenanciesService],
})
export class TenanciesModule {}
