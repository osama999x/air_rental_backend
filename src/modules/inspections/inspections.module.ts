import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inspection, InspectionItem } from '../../database/entities';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';

@Module({
  imports: [TypeOrmModule.forFeature([Inspection, InspectionItem])],
  controllers: [InspectionsController],
  providers: [InspectionsService],
})
export class InspectionsModule {}
