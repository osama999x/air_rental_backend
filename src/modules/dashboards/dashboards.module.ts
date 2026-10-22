import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceRequest, Property, RentObligation, Tenancy } from '../../database/entities';
import { ChatModule } from '../chat/chat.module';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';

@Module({
  imports: [TypeOrmModule.forFeature([Property, Tenancy, RentObligation, MaintenanceRequest]), ChatModule],
  controllers: [DashboardsController],
  providers: [DashboardsService],
})
export class DashboardsModule {}
