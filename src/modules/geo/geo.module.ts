import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  City,
  Country,
  Currency,
  Language,
  MeasurementUnit,
  SubscriptionPlan,
  UtilityProvider,
} from '../../database/entities';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Country,
      City,
      Language,
      Currency,
      MeasurementUnit,
      SubscriptionPlan,
      UtilityProvider,
    ]),
  ],
  controllers: [GeoController],
  providers: [GeoService],
  exports: [GeoService],
})
export class GeoModule {}
