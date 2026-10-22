import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';
import { ActiveRole, CurrentUser, Public } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { PortalRole, TenancyStatus } from '../../common/enums';
import { User } from '../../database/entities';
import { TenanciesService } from './tenancies.service';

class CreateTenancyDto {
  @IsUUID() propertyId: string;
  @IsDateString() startDate: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsUUID() tenantOrganizationId?: string;
}

class InviteDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() expiresInDays?: number;
}

class TokenDto {
  @IsString() token: string;
}

@ApiTags('Tenancies')
@ApiBearerAuth()
@Controller()
export class TenanciesController {
  constructor(private readonly tenancies: TenanciesService) {}

  @Post('tenancies')
  async create(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Body() dto: CreateTenancyDto) {
    return new ResponseDto('Tenancy proposed', await this.tenancies.create(user.id, role, dto));
  }

  @Get('tenancies')
  async list(@CurrentUser() user: User, @ActiveRole() role: PortalRole) {
    return new ResponseDto('Tenancies', await this.tenancies.list(user.id, role));
  }

  @Get('tenancies/:id')
  async get(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Tenancy', await this.tenancies.get(user.id, role, id));
  }

  @Post('tenancies/:id/invitations')
  async invite(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string, @Body() dto: InviteDto) {
    return new ResponseDto('Invitation created', await this.tenancies.invite(user.id, role, id, dto));
  }

  @Post('tenancies/:id/activate')
  async activate(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Tenancy activated', await this.tenancies.activate(user.id, role, id));
  }

  @Post('tenancies/:id/terminate')
  async terminate(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Tenancy terminated', await this.tenancies.close(user.id, role, id, TenancyStatus.TERMINATED));
  }

  @Post('tenancies/:id/complete')
  async complete(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Tenancy completed', await this.tenancies.close(user.id, role, id, TenancyStatus.COMPLETED));
  }

  @Public()
  @Get('invitations/:token')
  async preview(@Param('token') token: string) {
    return new ResponseDto('Invitation', await this.tenancies.preview(token));
  }

  @Post('invitations/accept')
  async accept(@CurrentUser() user: User, @Body() dto: TokenDto) {
    return new ResponseDto('Invitation accepted', await this.tenancies.respond(user, dto.token, true));
  }

  @Post('invitations/decline')
  async decline(@CurrentUser() user: User, @Body() dto: TokenDto) {
    return new ResponseDto('Invitation declined', await this.tenancies.respond(user, dto.token, false));
  }
}
