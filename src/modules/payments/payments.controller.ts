import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsString, IsUUID } from 'class-validator';
import { Request } from 'express';
import { ActiveRole, CurrentUser, Public } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { PaymentIntentStatus, PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { PaymentsService } from './payments.service';

class IntentDto {
  @IsUUID() billId: string;
  @IsString() idempotencyKey: string;
}

class WebhookDto {
  @IsString() eventId: string;
  @IsUUID() intentId: string;
  @IsEnum(PaymentIntentStatus) status: PaymentIntentStatus;
}

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Get('status')
  status() {
    return new ResponseDto('Payment configuration', this.payments.status());
  }

  @ApiBearerAuth()
  @Post('intents')
  async intent(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Body() dto: IntentDto) {
    return new ResponseDto('Payment intent created', await this.payments.createIntent(user.id, role, dto));
  }

  @ApiBearerAuth()
  @Post('client-return')
  clientReturn() {
    this.payments.clientReturn();
  }

  @ApiBearerAuth()
  @Post('sandbox/settle/:intentId')
  async sandbox(@CurrentUser() user: User, @Param('intentId') intentId: string) {
    return new ResponseDto('Sandbox payment settled', await this.payments.sandboxSettle(user.id, intentId));
  }

  @Public()
  @Post('webhooks/:provider')
  async webhook(
    @Param('provider') provider: string,
    @Body() dto: WebhookDto,
    @Headers('x-signature') signature: string,
    @Req() req: Request,
  ) {
    const raw = JSON.stringify(dto);
    return new ResponseDto('Webhook processed', await this.payments.webhook(
      provider,
      raw,
      signature,
      dto.eventId,
      dto.intentId,
      dto.status,
    ));
  }
}
