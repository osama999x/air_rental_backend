import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { ActiveRole, CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { AccessService } from '../access/access.service';
import { AuditService } from './audit.service';

class ActivityQuery {
  @IsUUID()
  propertyId: string;
}

@ApiTags('Activity')
@ApiBearerAuth()
@Controller('activity')
export class ActivityController {
  constructor(
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Query() query: ActivityQuery) {
    await this.access.assertProperty(user.id, role, query.propertyId);
    return new ResponseDto('Activity', await this.audit.listForProperty(query.propertyId));
  }
}
