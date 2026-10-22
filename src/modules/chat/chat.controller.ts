import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { User } from '../../database/entities';
import { ChatService } from './chat.service';

class SendDto {
  @IsOptional() @IsString() body?: string;
}

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('tenancies/:tenancyId')
  async thread(@CurrentUser() user: User, @Param('tenancyId') tenancyId: string) {
    return new ResponseDto('Chat thread', await this.chat.threadForTenancy(user.id, tenancyId));
  }

  @Get('threads/:threadId/messages')
  async messages(@CurrentUser() user: User, @Param('threadId') threadId: string, @Query('page') page = 1) {
    return new ResponseDto('Messages', await this.chat.listMessages(user.id, threadId, Number(page) || 1));
  }

  @Post('threads/:threadId/messages')
  @UseInterceptors(FileInterceptor('file'))
  async send(
    @CurrentUser() user: User,
    @Param('threadId') threadId: string,
    @Body() dto: SendDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return new ResponseDto('Message sent', await this.chat.send(user.id, threadId, dto.body, file));
  }

  @Post('messages/:id/read')
  async read(@CurrentUser() user: User, @Param('id') id: string) {
    return new ResponseDto('Read receipt stored', await this.chat.markRead(user.id, id));
  }

  @Patch('messages/:id')
  async edit(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: SendDto) {
    return new ResponseDto('Message edited', await this.chat.edit(user.id, id, dto.body || ''));
  }

  @Delete('messages/:id')
  async remove(@CurrentUser() user: User, @Param('id') id: string) {
    return new ResponseDto('Message deleted', await this.chat.remove(user.id, id));
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: User) {
    return new ResponseDto('Unread messages', { count: await this.chat.unread(user.id) });
  }
}
