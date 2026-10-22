import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PaymentsModule } from '../payments/payments.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AiModule, PaymentsModule],
  controllers: [HealthController],
})
export class HealthModule {}
