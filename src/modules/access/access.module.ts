import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ManagerAssignment,
  ManagerAssignmentProperty,
  Organization,
  OrganizationMember,
  Property,
  Tenancy,
  UserRole,
} from '../../database/entities';
import { AccessService } from './access.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserRole,
      Property,
      Tenancy,
      ManagerAssignment,
      ManagerAssignmentProperty,
      OrganizationMember,
      Organization,
    ]),
  ],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
