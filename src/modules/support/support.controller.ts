import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { IsString, MinLength } from 'class-validator';
import { Repository } from 'typeorm';
import { CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { SupportStatus } from '../../common/enums';
import { SupportTicket, User } from '../../database/entities';

class TicketDto {
  @IsString() @MinLength(3) subject: string;
  @IsString() @MinLength(3) body: string;
}

@ApiTags('Support')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(
    @InjectRepository(SupportTicket) private readonly tickets: Repository<SupportTicket>,
  ) {}

  @Post('tickets')
  async create(@CurrentUser() user: User, @Body() dto: TicketDto) {
    const ticket = await this.tickets.save(this.tickets.create({
      userId: user.id,
      subject: dto.subject,
      body: dto.body,
      status: SupportStatus.OPEN,
    }));
    return new ResponseDto('Support ticket created', ticket);
  }

  @Get('tickets')
  async list(@CurrentUser() user: User) {
    return new ResponseDto('Support tickets', await this.tickets.find({ where: { userId: user.id }, order: { createdAt: 'DESC' } }));
  }
}
