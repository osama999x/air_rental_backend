import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Property,
  RentObligation,
  RentPayment,
  RentPaymentProof,
  Tenancy,
  TenancyAgreement,
} from '../../database/entities';
import { RentController } from './rent.controller';
import { RentService } from './rent.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    RentObligation,
    RentPayment,
    RentPaymentProof,
    Tenancy,
    TenancyAgreement,
    Property,
  ])],
  controllers: [RentController],
  providers: [RentService],
  exports: [RentService],
})
export class RentModule {}
