import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailerModule } from '@nestjs-modules/mailer';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import mailConfig from './config/mail.config';
import environmentValidation from './config/environment.validation';
import { ALL_ENTITIES } from './database/entities';
import { GlobalExceptionFilter } from './common/filters';
import { DataResponseInterceptor } from './common/interceptors/data-response.interceptor';
import { CommonModule } from './common/common.module';
import { AccessModule } from './modules/access/access.module';
import { StorageModule } from './modules/storage/storage.module';
import { AuditModule } from './modules/audit/audit.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GeoModule } from './modules/geo/geo.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { TenanciesModule } from './modules/tenancies/tenancies.module';
import { AgreementsModule } from './modules/agreements/agreements.module';
import { ManagersModule } from './modules/managers/managers.module';
import { RentModule } from './modules/rent/rent.module';
import { BillsModule } from './modules/bills/bills.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { InspectionsModule } from './modules/inspections/inspections.module';
import { HandoversModule } from './modules/handovers/handovers.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { FinancesModule } from './modules/finances/finances.module';
import { ChatModule } from './modules/chat/chat.module';
import { AiModule } from './modules/ai/ai.module';
import { AdminModule } from './modules/admin/admin.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { SupportModule } from './modules/support/support.module';
import { HealthModule } from './modules/health/health.module';
import { RedisModule } from './modules/redis/redis.module';

const ENV = process.env.NODE_ENV;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', `.env.${ENV}`].filter(Boolean),
      load: [appConfig, databaseConfig, mailConfig],
      validationSchema: environmentValidation,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: config.get<'postgres'>('database.type') || 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.database'),
        entities: ALL_ENTITIES,
        synchronize: config.get<string>('database.synchronize') === 'true',
        logging: config.get<string>('database.logging') === 'true',
      }),
    }),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const configured = Boolean(config.get('mail.mailAddress') && config.get('mail.mailPassword'));
        return {
          transport: configured
            ? {
                host: config.get<string>('mail.mailHost'),
                port: config.get<number>('mail.mailPort'),
                secure: Number(config.get('mail.mailPort')) === 465,
                auth: {
                  user: config.get<string>('mail.mailAddress'),
                  pass: config.get<string>('mail.mailPassword'),
                },
              }
            : { jsonTransport: true },
          defaults: {
            from: `"Air Rental" <${config.get<string>('mail.mailAddress') || 'no-reply@localhost'}>`,
          },
        };
      },
    }),
    CommonModule,
    RedisModule,
    StorageModule,
    AuditModule,
    JobsModule,
    NotificationsModule,
    AccessModule,
    AuthModule,
    UsersModule,
    GeoModule,
    OrganizationsModule,
    PropertiesModule,
    TenanciesModule,
    AgreementsModule,
    ManagersModule,
    RentModule,
    BillsModule,
    PaymentsModule,
    SubscriptionsModule,
    MaintenanceModule,
    InspectionsModule,
    HandoversModule,
    DocumentsModule,
    FinancesModule,
    ChatModule,
    AiModule,
    AdminModule,
    DashboardsModule,
    SupportModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: DataResponseInterceptor },
  ],
})
export class AppModule {}
