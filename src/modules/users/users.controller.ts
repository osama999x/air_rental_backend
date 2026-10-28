import { Body, Controller, Get, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { ActiveRole, CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { AccountCategory, PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { AuthService } from '../auth/auth.service';
import { UsersService } from './users.service';

class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Ayesha' })
  @IsOptional() @IsString() @Length(1, 120) firstName?: string;

  @ApiPropertyOptional({ example: 'Khan' })
  @IsOptional() @IsString() @Length(1, 120) lastName?: string;

  @ApiPropertyOptional({ example: '+923001234567' })
  @IsOptional() @IsString() @Length(0, 32) phone?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional() @IsString() @Length(2, 12) preferredLanguage?: string;

  @ApiPropertyOptional({ example: 'Asia/Karachi' })
  @IsOptional() @IsString() @Length(1, 64) timezone?: string;

  @ApiPropertyOptional({ enum: AccountCategory })
  @IsOptional() @IsEnum(AccountCategory) category?: AccountCategory;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() organizationId?: string;

  @ApiPropertyOptional({ example: 'Ayesha Khan' })
  @IsOptional() @IsString() @Length(1, 180) displayName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @Length(0, 255) currentAddress?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @Length(0, 120) emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @Length(0, 32) emergencyContactPhone?: string;

  @ApiPropertyOptional({ type: 'string', format: 'binary', description: 'Profile photo. JPEG, PNG, or WebP.' })
  @IsOptional() file?: string;

  @ApiPropertyOptional({ description: 'Base64 image, or a data URL, when file is omitted.' })
  @IsOptional() @IsString() data?: string;

  @ApiPropertyOptional({ example: 'me.jpg' })
  @IsOptional() @IsString() fileName?: string;
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

  @Get('me/avatar')
  avatar(@CurrentUser() user: User) {
    return this.users.avatar(user.id);
  }

  @Patch('me')
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({ type: UpdateMeDto })
  @UseInterceptors(FileInterceptor('file'))
  async update(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Body() dto: UpdateMeDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return new ResponseDto('Profile updated', await this.users.edit(user.id, role, dto, file));
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
