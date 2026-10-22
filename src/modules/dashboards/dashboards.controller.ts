import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { DashboardsService } from './dashboards.service';

@ApiTags('Dashboards')
@ApiBearerAuth()
@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Roles(PortalRole.OWNER)
  @Get('owner')
  async owner(@CurrentUser() user: User) {
    return new ResponseDto('Owner dashboard', await this.dashboards.owner(user.id));
  }

  @Roles(PortalRole.TENANT)
  @Get('tenant')
  async tenant(@CurrentUser() user: User) {
    return new ResponseDto('Tenant dashboard', await this.dashboards.tenant(user.id));
  }

  @Roles(PortalRole.MANAGER)
  @Get('manager')
  async manager(@CurrentUser() user: User) {
    return new ResponseDto('Manager dashboard', await this.dashboards.manager(user.id));
  }
}
