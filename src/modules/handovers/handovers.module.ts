import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Handover, HandoverItem, SecurityDepositSettlement, Tenancy } from '../../database/entities';
import { HandoversController } from './handovers.controller';
import { HandoversService } from './handovers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Handover, HandoverItem, SecurityDepositSettlement, Tenancy])],
  controllers: [HandoversController],
  providers: [HandoversService],
})
export class HandoversModule {}
