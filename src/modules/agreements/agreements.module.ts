import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgreementRenewal, Property, Tenancy, TenancyAgreement } from '../../database/entities';
import { AgreementsController } from './agreements.controller';
import { AgreementsService } from './agreements.service';

@Module({
  imports: [TypeOrmModule.forFeature([TenancyAgreement, AgreementRenewal, Tenancy, Property])],
  controllers: [AgreementsController],
  providers: [AgreementsService],
  exports: [AgreementsService],
})
export class AgreementsModule {}
