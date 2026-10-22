import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsDateString, IsEmail, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ActiveRole, CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { AssignmentSide, PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { ManagersService } from './managers.service';

class AssignManagerDto {
  @IsEmail() managerEmail: string;
  @IsEnum(AssignmentSide) side: AssignmentSide;
  @IsArray() @IsUUID('4', { each: true }) propertyIds: string[];
  @IsArray() @IsString({ each: true }) permissions: string[];
  @IsOptional() @IsUUID() tenancyId?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsString() spendLimit?: string;
}

@ApiTags('Managers')
@ApiBearerAuth()
@Controller('managers')
export class ManagersController {
  constructor(private readonly managers: ManagersService) {}

  @Post('assignments')
  async assign(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Body() dto: AssignManagerDto) {
    return new ResponseDto('Assignment sent for acceptance', await this.managers.assign(user.id, role, dto));
  }

  @Get('assignments')
  async list(@CurrentUser() user: User, @ActiveRole() role: PortalRole) {
    return new ResponseDto('Assignments', await this.managers.list(user.id, role));
  }

  @Post('assignments/:id/accept')
  async accept(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Assignment accepted', await this.managers.respond(user.id, role, id, true));
  }

  @Post('assignments/:id/decline')
  async decline(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Assignment declined', await this.managers.respond(user.id, role, id, false));
  }

  @Post('assignments/:id/revoke')
  async revoke(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Assignment revoked', await this.managers.revoke(user.id, role, id));
  }
}
