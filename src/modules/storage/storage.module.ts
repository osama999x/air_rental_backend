import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertyMedia, User } from '../../database/entities';
import { PublicFilesController } from './public-files.controller';
import { StorageService } from './storage.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PropertyMedia, User])],
  controllers: [PublicFilesController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
