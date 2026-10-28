import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';
import { setupSwagger } from './bootstrap/swagger';
import { RedisService } from './modules/redis/redis.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  configureApp(app, config, app.get(RedisService));
  const swagger = setupSwagger(app, config);
  const port = config.get<number>('PORT') || 3000;
  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.log(`Air Rental API listening on http://localhost:${port}`);
  logger.log(`Health check: http://localhost:${port}/api/v1/health`);
  if (swagger) logger.log(`Swagger: http://localhost:${port}/api-docs`);
}
bootstrap();
