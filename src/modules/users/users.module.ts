import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityDocument, ManagerProfile, OwnerProfile, TenantProfile, Tenancy, User } from '../../database/entities';
import { AuthModule } from '../auth/auth.module';
import { IdentityDocumentsController } from './identity-documents.controller';
import { IdentityDocumentsService } from './identity-documents.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, OwnerProfile, TenantProfile, ManagerProfile, IdentityDocument, Tenancy]), AuthModule],
  controllers: [UsersController, IdentityDocumentsController],
  providers: [UsersService, IdentityDocumentsService],
  exports: [UsersService, IdentityDocumentsService],
})
export class UsersModule {}
