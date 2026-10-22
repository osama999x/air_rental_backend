import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { OrganizationMemberRole } from '../../common/enums';
import { User } from '../../database/entities';
import { OrganizationsService } from './organizations.service';

class CreateOrganizationDto {
  @IsString() name: string;
  @IsOptional() @IsString() organizationType?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() addressLine?: string;
  @IsOptional() @IsUUID() countryId?: string;
  @IsOptional() @IsUUID() cityId?: string;
}

class AddMemberDto {
  @IsUUID() userId: string;
  @IsIn(Object.values(OrganizationMemberRole)) memberRole: OrganizationMemberRole;
}

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  async create(@CurrentUser() user: User, @Body() dto: CreateOrganizationDto) {
    return new ResponseDto('Organization created', await this.organizations.create(user, dto));
  }

  @Get()
  async list(@CurrentUser() user: User) {
    return new ResponseDto('Organizations', await this.organizations.list(user.id));
  }

  @Get(':id')
  async get(@CurrentUser() user: User, @Param('id') id: string) {
    return new ResponseDto('Organization', await this.organizations.get(user.id, id));
  }

  @Post(':id/members')
  async add(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: AddMemberDto) {
    return new ResponseDto('Member added', await this.organizations.addMember(user.id, id, dto.userId, dto.memberRole));
  }
}
