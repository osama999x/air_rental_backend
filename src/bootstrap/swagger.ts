import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as basicAuth from 'express-basic-auth';
import { isSwaggerEnabled, SWAGGER_PATH } from './constants';

export function setupSwagger(
  app: INestApplication,
  config: ConfigService,
): boolean {
  const environment = config.get<string>('NODE_ENV');
  if (!isSwaggerEnabled(environment)) {
    return false;
  }

  const user = config.get<string>('SWAGGER_USER');
  const password = config.get<string>('SWAGGER_PASSWORD');
  const port = config.get<number>('PORT') || 3000;

  app.use(
    [`/${SWAGGER_PATH}`, `/${SWAGGER_PATH}-json`],
    basicAuth({
      challenge: true,
      users: { [user]: password },
    }),
  );

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Air Rental API')
      .setDescription(
        'Air Rental API for owner, tenant, manager, and internal admin clients. Public routes and /admin routes use separate authentication.',
      )
      .setVersion(config.get<string>('appConfig.apiVersion') || '1.0')
      .addBearerAuth()
      .addServer(`http://localhost:${port}`, 'Local')
      .build(),
  );

  SwaggerModule.setup(SWAGGER_PATH, app, document);
  return true;
}
