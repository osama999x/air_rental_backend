import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { ActiveRole, CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { AgreementsService } from './agreements.service';

class CreateAgreementDto {
  @IsDateString() startDate: string;
  @IsDateString() expiryDate: string;
  @IsString() monthlyRent: string;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsString() securityDeposit?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(28) rentDueDay: number;
  @IsOptional() @IsString() renewalTerms?: string;
  @IsOptional() @IsString() additionalTerms?: string;
}

class RenewTenancyDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) years?: number;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() monthlyRent?: string;
}

class RenewDto {
  @IsOptional() @IsInt() @Min(1) @Max(30) years?: number;
  @IsOptional() @IsDateString() customEndDate?: string;
}

class RentAdjustmentDto {
  @IsString() monthlyRent: string;
  @IsDateString() effectiveDate: string;
  @IsString() @MinLength(1) reason: string;
}

@ApiTags('Agreements')
@ApiBearerAuth()
@Controller()
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  @Get('agreements/expiring')
  async expiring(@CurrentUser() user: User, @ActiveRole() role: PortalRole) {
    return new ResponseDto('Agreements expiring soon', await this.agreements.expiring(user.id, role));
  }

  @Post('tenancies/:tenancyId/agreements')
  @ApiConsumes('application/json', 'multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Param('tenancyId') tenancyId: string,
    @Body() dto: CreateAgreementDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return new ResponseDto('Agreement created', await this.agreements.create(user.id, role, tenancyId, dto, file));
  }

  @Post('tenancies/:tenancyId/agreements/extract')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async extract(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Param('tenancyId') tenancyId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return new ResponseDto('Agreement extraction', await this.agreements.extract(user.id, role, tenancyId, file));
  }

  @Get('tenancies/:tenancyId/agreements')
  async list(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('tenancyId') tenancyId: string) {
    return new ResponseDto('Agreements', await this.agreements.listForTenancy(user.id, role, tenancyId));
  }

  @Post('tenancies/:tenancyId/renewals')
  @ApiConsumes('application/json', 'multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async renewTenancy(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Param('tenancyId') tenancyId: string,
    @Body() dto: RenewTenancyDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return new ResponseDto('Agreement renewed', await this.agreements.renewTenancy(user.id, role, tenancyId, dto, file));
  }

  @Get('agreements/:id/download')
  download(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return this.agreements.download(user.id, role, id);
  }

  @Get('tenancies/:tenancyId/renewals')
  async history(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('tenancyId') tenancyId: string) {
    return new ResponseDto('Renewal history', await this.agreements.history(user.id, role, tenancyId));
  }

  @Post('agreements/:id/renew')
  async renew(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string, @Body() dto: RenewDto) {
    return new ResponseDto('Agreement renewed', await this.agreements.renew(user.id, role, id, dto));
  }

  @Post('agreements/:id/rent-adjustment')
  async adjustRent(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Param('id') id: string,
    @Body() dto: RentAdjustmentDto,
  ) {
    return new ResponseDto('Rent adjusted', await this.agreements.adjustRent(user.id, role, id, dto));
  }
}
