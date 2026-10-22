import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { ResponseDto } from '../../common/dto/response';
import { User } from '../../database/entities';
import { NotificationsService } from './notifications.service';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

class PreferenceDto {
  @IsOptional() @IsBoolean() emailEnabled?: boolean;
  @IsOptional() @IsBoolean() pushEnabled?: boolean;
  @IsOptional() @IsBoolean() smsEnabled?: boolean;
  @IsOptional() @IsBoolean() inAppEnabled?: boolean;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsInt() @Min(0) @Max(30) rentReminderDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(30) billReminderDays?: number;
  @IsOptional() @IsBoolean() autoRemind?: boolean;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: User, @Query() query: PageQueryDto) {
    const data = await this.notifications.list(user.id, query.page, query.pageSize);
    return new ResponseDto('Notifications', data);
  }

  @Patch(':id/read')
  async read(@CurrentUser() user: User, @Param('id') id: string) {
    return new ResponseDto('Notification marked read', await this.notifications.markRead(user.id, id));
  }

  @Get('preferences')
  async getPreferences(@CurrentUser() user: User) {
    return new ResponseDto('Preferences', await this.notifications.getPreferences(user.id));
  }

  @Patch('preferences')
  async preferences(@CurrentUser() user: User, @Body() dto: PreferenceDto) {
    return new ResponseDto(
      'Preferences updated',
      await this.notifications.updatePreferences(user.id, dto),
    );
  }
}
