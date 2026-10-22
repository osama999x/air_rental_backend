import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Bill,
  BillFetchAttempt,
  BillPayment,
  BillPaymentProof,
  BillResponsibility,
  Property,
  Tenancy,
  UtilityProvider,
} from '../../database/entities';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    Bill,
    BillResponsibility,
    BillPayment,
    BillPaymentProof,
    BillFetchAttempt,
    UtilityProvider,
    Property,
    Tenancy,
  ])],
  controllers: [BillsController],
  providers: [BillsService],
  exports: [BillsService],
})
export class BillsModule {}
