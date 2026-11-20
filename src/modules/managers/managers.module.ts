import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceRequest, ManagerAssignment, ManagerAssignmentProperty, Property, Tenancy, User, UserRole } from '../../database/entities';
import { ManagersController } from './managers.controller';
import { ManagersService } from './managers.service';

@Module({
  imports: [TypeOrmModule.forFeature([ManagerAssignment, ManagerAssignmentProperty, User, UserRole, Tenancy, Property, MaintenanceRequest])],
  controllers: [ManagersController],
  providers: [ManagersService],
  exports: [ManagersService],
})
export class ManagersModule {}
