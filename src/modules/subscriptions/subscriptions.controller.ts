import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Roles(PortalRole.OWNER)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('me')
  async me(@CurrentUser() user: User) {
    return new ResponseDto('Subscription', await this.subscriptions.current(user.id));
  }

  @Post('recalculate')
  async recalculate(@CurrentUser() user: User) {
    return new ResponseDto('Subscription recalculated', await this.subscriptions.recalculate(user.id));
  }

  @Post('invoices')
  async invoice(@CurrentUser() user: User) {
    return new ResponseDto('Invoice opened', await this.subscriptions.openInvoice(user.id));
  }

  @Get('invoices')
  async invoices(@CurrentUser() user: User) {
    return new ResponseDto('Invoices', await this.subscriptions.invoicesFor(user.id));
  }
}
