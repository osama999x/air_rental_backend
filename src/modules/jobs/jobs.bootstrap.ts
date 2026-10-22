import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsService } from './jobs.service';
import { toIsoDate } from '../../common/utils/dates.util';

@Injectable()
export class JobsBootstrap implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobsBootstrap.name);

  constructor(
    private readonly jobs: JobsService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const today = toIsoDate(new Date());
    for (const type of ['rent.scan', 'agreement.scan', 'invitation.scan', 'insurance.scan', 'bill.scan']) {
      await this.jobs.enqueue(type, {}, { dedupeKey: `${type}:${today}` });
    }
    const runInApi = this.config.get<string>('RUN_JOBS_IN_API') !== 'false'
      && this.config.get<string>('NODE_ENV') !== 'production';
    if (runInApi || this.config.get<string>('PROCESS_ROLE') === 'worker') {
      this.logger.log('Background job loop started in this process');
      this.jobs.startLoop();
    } else {
      this.logger.log('API process will not run jobs. Start the worker with npm run start:worker');
    }
  }

  onApplicationShutdown() {
    this.jobs.stopLoop();
  }
}
