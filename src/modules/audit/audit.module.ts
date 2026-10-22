import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../database/entities';
import { ActivityController } from './activity.controller';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [ActivityController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
