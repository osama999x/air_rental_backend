import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsurancePolicy, Invitation, Property, Tenancy, User } from '../../database/entities';
import { TenanciesController } from './tenancies.controller';
import { TenanciesService } from './tenancies.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenancy, Invitation, Property, User, InsurancePolicy])],
  controllers: [TenanciesController],
  providers: [TenanciesService],
  exports: [TenanciesService],
})
export class TenanciesModule {}
