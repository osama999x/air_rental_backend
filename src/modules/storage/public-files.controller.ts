import { Controller, ForbiddenException, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../../common/decorators';
import { MediaKind } from '../../common/enums';
import { PropertyMedia, User } from '../../database/entities';
import { StorageService } from './storage.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Controller()
export class PublicFilesController {
  constructor(
    @InjectRepository(PropertyMedia) private readonly media: Repository<PropertyMedia>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get('public/media/:id')
  async mediaFile(@Param('id') id: string, @Query('exp') exp = '', @Query('sig') sig = '') {
    if (!UUID.test(id) || !this.storage.verifySigned(`property-media:${id}`, exp, sig)) {
      throw new ForbiddenException('This file link has expired');
    }
    const file = await this.media.findOne({ where: { id } });
    if (!file || file.kind !== MediaKind.PHOTO) throw new NotFoundException('Photo was not found');
    return this.storage.deliver(file.storageKey, file.mimeType, file.originalName || 'photo', true);
  }

  @Public()
  @Get('public/avatars/:id')
  async avatar(@Param('id') id: string, @Query('exp') exp = '', @Query('sig') sig = '') {
    if (!UUID.test(id) || !this.storage.verifySigned(`avatar:${id}`, exp, sig)) {
      throw new ForbiddenException('This file link has expired');
    }
    const user = await this.users.findOne({ where: { id } });
    if (!user?.avatarStorageKey) throw new NotFoundException('Profile photo was not found');
    return this.storage.deliverFitted(user.avatarStorageKey, 256);
  }
}
