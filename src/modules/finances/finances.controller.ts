import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';
import { ActiveRole, CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { FinancesService } from './finances.service';

class ExpenseDto {
  @IsUUID() propertyId: string;
  @IsString() category: string;
  @IsString() amount: string;
  @IsString() currencyCode: string;
  @IsDateString() incurredOn: string;
  @IsOptional() @IsString() description?: string;
}

@ApiTags('Finances')
@ApiBearerAuth()
@Controller('finances')
export class FinancesController {
  constructor(private readonly finances: FinancesService) {}

  @Get('properties/:propertyId')
  @ApiQuery({ name: 'from', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-12-31' })
  async summary(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Param('propertyId') propertyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return new ResponseDto('Property financial summary', await this.finances.summary(user.id, role, propertyId, from, to));
  }

  @Post('expenses')
  async expense(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Body() dto: ExpenseDto) {
    return new ResponseDto('Expense recorded', await this.finances.addExpense(user.id, role, dto));
  }
}
