import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Organization,
  Property,
  Subscription,
  SubscriptionInvoice,
  SubscriptionPlan,
  Tenancy,
} from '../../database/entities';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    Subscription,
    SubscriptionPlan,
    SubscriptionInvoice,
    Property,
    Tenancy,
    Organization,
  ])],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
