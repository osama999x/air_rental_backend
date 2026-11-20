import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgreementRenewal, ManagerAssignment, ManagerAssignmentProperty, Property, Tenancy, TenancyAgreement, User } from '../../database/entities';
import { AgreementsController } from './agreements.controller';
import { AgreementsService } from './agreements.service';

@Module({
  imports: [TypeOrmModule.forFeature([TenancyAgreement, AgreementRenewal, Tenancy, Property, ManagerAssignment, ManagerAssignmentProperty, User])],
  controllers: [AgreementsController],
  providers: [AgreementsService],
  exports: [AgreementsService],
})
export class AgreementsModule {}
