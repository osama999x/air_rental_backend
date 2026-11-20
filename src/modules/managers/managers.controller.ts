import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';
import { ActiveRole, CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { ManagersService } from './managers.service';

class AssignManagerDto {
  @IsEmail() email: string;
  @IsOptional() @IsString() name?: string;
  @IsArray() @IsUUID('4', { each: true }) propertyIds: string[];
  @IsArray() @IsString({ each: true }) permissions: string[];
}

class UpdateAssignmentDto {
  @IsArray() @IsUUID('4', { each: true }) propertyIds: string[];
  @IsArray() @IsString({ each: true }) permissions: string[];
}

@ApiTags('Managers')
@ApiBearerAuth()
@Controller('managers')
export class ManagersController {
  constructor(private readonly managers: ManagersService) {}

  @Post('invitations')
  async invite(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Body() dto: AssignManagerDto) {
    return new ResponseDto('Manager invitation sent', await this.managers.assign(user.id, role, dto));
  }

  @Post('assignments')
  async assign(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Body() dto: AssignManagerDto) {
    return new ResponseDto('Assignment sent for acceptance', await this.managers.assign(user.id, role, dto));
  }

  @Get('me')
  async mine(@CurrentUser() user: User, @ActiveRole() role: PortalRole) {
    return new ResponseDto('Manager portal', await this.managers.mine(user.id, role));
  }

  @Get('activity')
  async activity(@CurrentUser() user: User, @ActiveRole() role: PortalRole) {
    return new ResponseDto('Manager activity', await this.managers.activity(user.id, role));
  }

  @Get('assignments')
  async list(@CurrentUser() user: User, @ActiveRole() role: PortalRole) {
    return new ResponseDto('Assignments', await this.managers.list(user.id, role));
  }

  @Patch('assignments/:id')
  async update(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return new ResponseDto('Assignment updated', await this.managers.update(user.id, role, id, dto));
  }

  @Delete('assignments/:id')
  async remove(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Assignment revoked', await this.managers.revoke(user.id, role, id));
  }

  @Get('properties/:propertyId')
  async property(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('propertyId') propertyId: string) {
    return new ResponseDto('Property managers', await this.managers.listForProperty(user.id, role, propertyId));
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
