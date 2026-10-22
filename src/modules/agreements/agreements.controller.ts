import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
  @IsInt() @Min(1) @Max(28) rentDueDay: number;
  @IsOptional() @IsString() renewalTerms?: string;
  @IsOptional() @IsString() additionalTerms?: string;
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

  @Post('tenancies/:tenancyId/agreements')
  async create(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Param('tenancyId') tenancyId: string,
    @Body() dto: CreateAgreementDto,
  ) {
    return new ResponseDto('Agreement created', await this.agreements.create(user.id, role, tenancyId, dto));
  }

  @Get('tenancies/:tenancyId/agreements')
  async list(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('tenancyId') tenancyId: string) {
    return new ResponseDto('Agreements', await this.agreements.listForTenancy(user.id, role, tenancyId));
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
