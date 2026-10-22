import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';
import { ActiveRole, CurrentUser, Public } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { AiService } from './ai.service';

class AskDto {
  @IsString() question: string;
}

class ExtractDto {
  @IsUUID() documentId: string;
}

@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Public()
  @Get('status')
  status() {
    return new ResponseDto('AI configuration', this.ai.status());
  }

  @ApiBearerAuth()
  @Post('ask')
  async ask(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Body() dto: AskDto) {
    return new ResponseDto('AI response', await this.ai.ask(user.id, role, dto.question));
  }

  @ApiBearerAuth()
  @Post('extract')
  async extract(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Body() dto: ExtractDto) {
    return new ResponseDto('Extraction stored', await this.ai.extract(user.id, role, dto.documentId));
  }
}
