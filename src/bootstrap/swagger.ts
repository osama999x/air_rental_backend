import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as basicAuth from 'express-basic-auth';
import { PortalRole } from '../common/enums';
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

  const localServer = `http://localhost:${port}`;
  const builder = new DocumentBuilder()
    .setTitle('Air Rental API')
    .setDescription(
      'Air Rental API for owner, tenant, manager, and internal admin clients. Protected routes need Authorization: Bearer <accessToken>. Portal routes also read X-Portal-Role. If that header is omitted, the account preferred role is used. Public routes and /admin routes use separate authentication.',
    )
    .setVersion(config.get<string>('appConfig.apiVersion') || '1.0')
    .addBearerAuth()
    .addGlobalParameters({
      name: 'X-Portal-Role',
      in: 'header',
      required: false,
      description:
        'OWNER, TENANT, or MANAGER. Property changes (upload, edit, delete, transfer) are allowed only for OWNER on a property that user owns.',
      schema: {
        type: 'string',
        enum: [PortalRole.OWNER, PortalRole.TENANT, PortalRole.MANAGER],
      },
    })
    .addServer(localServer, 'API on this machine')
    .addServer('http://179.236.65.153:3009', 'Server');

  const publicUrl = process.env.APP_PUBLIC_URL?.trim().replace(/\/$/, '');
  if (publicUrl && publicUrl !== localServer) {
    builder.addServer(publicUrl, 'Public API');
  }

  const document = SwaggerModule.createDocument(app, builder.build());

  SwaggerModule.setup(SWAGGER_PATH, app, document);
  return true;
}
