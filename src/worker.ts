import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JobsService } from './modules/jobs/jobs.service';

async function bootstrap() {
  process.env.PROCESS_ROLE = 'worker';
  const app = await NestFactory.createApplicationContext(AppModule);
  const jobs = app.get(JobsService);
  const logger = new Logger('Worker');
  jobs.startLoop();
  logger.log('Air Rental worker is processing scheduled jobs');
  app.enableShutdownHooks();
}

bootstrap();
