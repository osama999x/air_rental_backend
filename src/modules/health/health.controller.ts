import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { PaymentsService } from '../payments/payments.service';
import { AiService } from '../ai/ai.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: StorageService,
    private readonly payments: PaymentsService,
    private readonly ai: AiService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  live() {
    return new ResponseDto('Air Rental API is running', { status: 'ok' });
  }

  @Public()
  @Get('ready')
  async ready() {
    await this.dataSource.query('SELECT 1');
    const redisUp = await this.redis.ping();
    if (!redisUp) throw new ServiceUnavailableException('Redis is not reachable');
    return new ResponseDto('Ready', { status: 'ready', database: 'up', redis: 'up' });
  }

  @Public()
  @Get('integrations')
  integrations() {
    return new ResponseDto('Integration status', {
      storage: this.storage.status(),
      payments: this.payments.status(),
      ai: this.ai.status(),
      redis: this.redis.status(),
    });
  }
}
