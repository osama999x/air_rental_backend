import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduledJob } from '../../database/entities';
import { JobsService } from './jobs.service';
import { JobsBootstrap } from './jobs.bootstrap';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ScheduledJob])],
  providers: [JobsService, JobsBootstrap],
  exports: [JobsService],
})
export class JobsModule {}
