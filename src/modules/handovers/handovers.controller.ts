import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ActiveRole, CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { HandoverType, PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { HandoversService } from './handovers.service';

class CreateHandoverDto {
  @IsUUID() tenancyId: string;
  @IsEnum(HandoverType) type: HandoverType;
  @IsOptional() @IsString() conditionSummary?: string;
}

class ItemDto {
  @IsString() kind: string;
  @IsString() label: string;
  @IsOptional() @IsString() valueText?: string;
  @IsOptional() @IsString() numericValue?: string;
  @IsOptional() @IsString() unit?: string;
}

class SettleDto {
  @IsString() depositReceived: string;
  @IsString() approvedDeductions: string;
  @IsOptional() @IsString() deductionReason?: string;
  @IsString() currencyCode: string;
  @IsOptional() @IsString() paymentReference?: string;
}

@ApiTags('Handovers')
@ApiBearerAuth()
@Controller()
export class HandoversController {
  constructor(private readonly handovers: HandoversService) {}

  @Post('handovers')
  async create(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Body() dto: CreateHandoverDto) {
    return new ResponseDto('Handover created', await this.handovers.create(user.id, role, dto));
  }

  @Get('handovers')
  @ApiQuery({ name: 'tenancyId', required: true, schema: { type: 'string', format: 'uuid' } })
  async list(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Query('tenancyId') tenancyId: string) {
    return new ResponseDto('Handovers', await this.handovers.list(user.id, role, tenancyId));
  }

  @Get('handovers/:id')
  async get(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Handover', await this.handovers.get(user.id, role, id));
  }

  @Post('handovers/:id/items')
  async item(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string, @Body() dto: ItemDto) {
    return new ResponseDto('Handover item added', await this.handovers.addItem(user.id, role, id, dto));
  }

  @Post('handovers/:id/confirm')
  async confirm(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Handover confirmation recorded', await this.handovers.confirm(user.id, role, id));
  }

  @Get('tenancies/:tenancyId/deposit-settlement')
  async settlement(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('tenancyId') tenancyId: string) {
    return new ResponseDto('Deposit settlement', await this.handovers.getSettlement(user.id, role, tenancyId));
  }

  @Post('tenancies/:tenancyId/deposit-settlement')
  async settle(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('tenancyId') tenancyId: string, @Body() dto: SettleDto) {
    return new ResponseDto('Deposit settled', await this.handovers.settle(user.id, role, tenancyId, dto));
  }
}
