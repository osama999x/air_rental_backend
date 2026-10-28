import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Allow, IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { Request } from 'express';
import { Public } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { UserStatus } from '../../common/enums';
import { AdminAccount } from '../../database/entities';
import { AdminService } from './admin.service';

class AdminLoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

class MfaDto {
  @IsString() token: string;
  @IsString() code: string;
}

class StatusDto {
  @IsIn([UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.DEACTIVATED])
  status: UserStatus;
  @IsString() @MinLength(3) reason: string;
}

class SettingDto {
  @IsString() key: string;
  @Allow() value: string | number | boolean;
}

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Public()
  @Post('auth/login')
  async login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return new ResponseDto('Admin authentication started', await this.admin.login(dto.email, dto.password, { ip: req.ip, userAgent: req.headers['user-agent'] }));
  }

  @Public()
  @Post('auth/mfa')
  async mfa(@Body() dto: MfaDto, @Req() req: Request) {
    return new ResponseDto('Admin session created', await this.admin.confirmMfa(dto.token, dto.code, { ip: req.ip, userAgent: req.headers['user-agent'] }));
  }

  @Get('dashboard')
  async dashboard(@Req() req: Request & { admin: AdminAccount }) {
    return new ResponseDto('Admin dashboard', await this.admin.dashboard(req.admin.id));
  }

  @Get('users')
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', default: 1 } })
  async users(@Req() req: Request & { admin: AdminAccount }, @Query('search') search?: string, @Query('page') page = 1) {
    return new ResponseDto('Users', await this.admin.usersList(req.admin.id, search, Number(page) || 1));
  }

  @Patch('users/:id/status')
  async status(@Req() req: Request & { admin: AdminAccount }, @Param('id') id: string, @Body() dto: StatusDto) {
    return new ResponseDto('User status updated', await this.admin.setUserStatus(req.admin.id, id, dto.status, dto.reason));
  }

  @Get('organizations')
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', default: 1 } })
  async organizations(@Req() req: Request & { admin: AdminAccount }, @Query('page') page = 1) {
    return new ResponseDto('Organizations', await this.admin.listOrganizations(req.admin.id, Number(page) || 1));
  }

  @Get('properties')
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', default: 1 } })
  async properties(@Req() req: Request & { admin: AdminAccount }, @Query('page') page = 1) {
    return new ResponseDto('Properties', await this.admin.listProperties(req.admin.id, Number(page) || 1));
  }

  @Get('subscriptions')
  async subscriptions(@Req() req: Request & { admin: AdminAccount }) {
    return new ResponseDto('Subscriptions', await this.admin.subscriptionList(req.admin.id));
  }

  @Get('providers')
  async providers(@Req() req: Request & { admin: AdminAccount }) {
    return new ResponseDto('Providers', await this.admin.providerList(req.admin.id));
  }

  @Get('integrations')
  async integrations(@Req() req: Request & { admin: AdminAccount }) {
    return new ResponseDto('Integrations', await this.admin.integrations(req.admin.id));
  }

  @Get('support')
  async support(@Req() req: Request & { admin: AdminAccount }) {
    return new ResponseDto('Support tickets', await this.admin.support(req.admin.id));
  }

  @Get('audit-logs')
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', default: 1 } })
  async audit(@Req() req: Request & { admin: AdminAccount }, @Query('page') page = 1) {
    return new ResponseDto('Audit logs', await this.admin.searchAudit(req.admin.id, Number(page) || 1));
  }

  @Get('settings')
  async settings(@Req() req: Request & { admin: AdminAccount }) {
    return new ResponseDto('Settings', await this.admin.settingsList(req.admin.id));
  }

  @Patch('settings')
  async updateSetting(@Req() req: Request & { admin: AdminAccount }, @Body() dto: SettingDto) {
    return new ResponseDto('Setting updated', await this.admin.updateSetting(req.admin.id, dto.key, dto.value));
  }

  @Get('analytics')
  async analytics(@Req() req: Request & { admin: AdminAccount }) {
    return new ResponseDto('Analytics', await this.admin.dashboard(req.admin.id));
  }
}
