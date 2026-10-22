import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagerAssignment, ManagerAssignmentProperty, Tenancy, User, UserRole } from '../../database/entities';
import { ManagersController } from './managers.controller';
import { ManagersService } from './managers.service';

@Module({
  imports: [TypeOrmModule.forFeature([ManagerAssignment, ManagerAssignmentProperty, User, UserRole, Tenancy])],
  controllers: [ManagersController],
  providers: [ManagersService],
  exports: [ManagersService],
})
export class ManagersModule {}
