import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { AccountCategory, PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { AuthService } from '../auth/auth.service';
import { UsersService } from './users.service';

class UpdateMeDto {
  @IsOptional() @IsString() @Length(1, 120) firstName?: string;
  @IsOptional() @IsString() @Length(1, 120) lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() preferredLanguage?: string;
  @IsOptional() @IsString() timezone?: string;
}

class ProfileDto {
  @IsOptional() @IsIn([AccountCategory.INDIVIDUAL, AccountCategory.BUSINESS]) category?: AccountCategory;
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() currentAddress?: string;
  @IsOptional() @IsString() emergencyContactName?: string;
  @IsOptional() @IsString() emergencyContactPhone?: string;
}

class RoleDto {
  @IsIn([PortalRole.OWNER, PortalRole.TENANT, PortalRole.MANAGER])
  role: PortalRole;
}

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: User) {
    return new ResponseDto('Profile', await this.users.me(user.id));
  }

  @Patch('me')
  async update(@CurrentUser() user: User, @Body() dto: UpdateMeDto) {
    return new ResponseDto('Profile updated', await this.users.update(user.id, dto));
  }

  @Patch('me/owner-profile')
  async owner(@CurrentUser() user: User, @Body() dto: ProfileDto) {
    return new ResponseDto('Owner profile updated', await this.users.updateOwner(user, dto));
  }

  @Patch('me/tenant-profile')
  async tenant(@CurrentUser() user: User, @Body() dto: ProfileDto) {
    return new ResponseDto('Tenant profile updated', await this.users.updateTenant(user, dto));
  }

  @Post('me/roles')
  async role(@CurrentUser() user: User, @Body() dto: RoleDto) {
    return new ResponseDto('Role added', await this.auth.grantRole(user, dto.role));
  }

  @Post('me/deactivate')
  async deactivate(@CurrentUser() user: User) {
    return new ResponseDto('Account deactivated', await this.auth.deactivate(user));
  }

  @Post('me/deletion-request')
  async deletion(@CurrentUser() user: User) {
    return new ResponseDto('Deletion requested', await this.auth.requestDeletion(user));
  }
}
