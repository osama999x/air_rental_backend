import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ActiveRole, CurrentUser, Public } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { InvitationChannel, PortalRole, TenancyStatus } from '../../common/enums';
import { User } from '../../database/entities';
import { TenanciesService } from './tenancies.service';

class CreateTenancyDto {
  @IsUUID() propertyId: string;
  @IsDateString() startDate: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsUUID() tenantOrganizationId?: string;
  @IsOptional() @Matches(/^\d+(\.\d{1,4})?$/) monthlyRent?: string;
}

class InviteDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() tenantName?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsEnum(InvitationChannel) channel?: InvitationChannel;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) expiresInDays?: number;
}

class TokenDto {
  @IsString() token: string;
}

class OptionalTokenDto {
  @IsOptional() @IsString() token?: string;
}

class ReviewDto {
  @IsString() @MinLength(1) @MaxLength(2000) message: string;
  @IsOptional() @IsString() token?: string;
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
  async list(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Query('propertyId') propertyId?: string,
  ) {
    return new ResponseDto('Tenancies', await this.tenancies.list(user.id, role, propertyId));
  }

  @Get('tenancies/invitations')
  async invitations(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Query('propertyId') propertyId?: string,
  ) {
    return new ResponseDto('Invitations', await this.tenancies.listInvitations(user.id, role, propertyId));
  }

  @Public()
  @Get('tenancies/invitations/lookup')
  async lookup(@Query('token') token: string) {
    return new ResponseDto('Invitation', await this.tenancies.lookup(token));
  }

  @Post('tenancies/invitations/:id/accept')
  async acceptById(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: OptionalTokenDto) {
    return new ResponseDto('Invitation accepted', await this.tenancies.respondById(user, id, true, dto.token));
  }

  @Post('tenancies/invitations/:id/decline')
  async declineById(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: OptionalTokenDto) {
    return new ResponseDto('Invitation declined', await this.tenancies.respondById(user, id, false, dto.token));
  }

  @Post('tenancies/invitations/:id/review')
  async review(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: ReviewDto) {
    return new ResponseDto('Invitation review sent', await this.tenancies.review(user, id, dto.message, dto.token));
  }

  @Post('tenancies/invitations/:id/revoke')
  async revoke(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Invitation revoked', await this.tenancies.revoke(user.id, role, id));
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
