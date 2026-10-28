import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiProperty, ApiPropertyOptional, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ActiveRole, CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { BillCategory, PortalRole, ResponsibilityMode } from '../../common/enums';
import { User } from '../../database/entities';
import { BillsService } from './bills.service';

class FetchBillDto {
  @IsUUID() propertyId: string;
  @IsUUID() providerId: string;
  @IsString() consumerNumber: string;
}

class ProofDto {
  @IsString() amount: string;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  file?: string;

  @ApiPropertyOptional({ description: 'Base64 file or a data URL. Used when file is omitted.' })
  @IsOptional() @IsString()
  data?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  fileName?: string;
}

class DecisionDto {
  @IsOptional() @IsString() notes?: string;
}

class CreateBillDto {
  @IsUUID() propertyId: string;
  @IsOptional() @IsUUID() tenancyId?: string;
  @IsOptional() @IsUUID() providerId?: string;
  @IsEnum(BillCategory) category: BillCategory;
  @IsOptional() @IsString() consumerNumber?: string;
  @IsOptional() @IsString() periodStart?: string;
  @IsOptional() @IsString() periodEnd?: string;
  @IsString() amount: string;
  @IsString() currencyCode: string;
  @IsOptional() @IsString() issueDate?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() externalReference?: string;
  @IsEnum(ResponsibilityMode) responsibilityMode: ResponsibilityMode;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  @IsOptional()
  file?: string;

  @ApiPropertyOptional({ description: 'Base64 file or a data URL. Used when file is omitted.' })
  @IsOptional() @IsString()
  data?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  fileName?: string;
}

@ApiTags('Bills')
@ApiBearerAuth()
@Controller()
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  @Get('utility-providers')
  async providers() {
    return new ResponseDto('Utility providers', await this.bills.providersList());
  }

  @Post('bills/fetch')
  async fetch(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Body() dto: FetchBillDto) {
    return new ResponseDto('Bill fetch recorded', await this.bills.fetch(user.id, role, dto));
  }

  @Get('bills/proofs/:id/download')
  downloadProof(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return this.bills.downloadProof(user.id, role, id);
  }

  @Post('bills/proofs/:id/approve')
  async approve(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Param('id') id: string,
    @Body() dto: DecisionDto,
  ) {
    return new ResponseDto('Bill proof approved', await this.bills.decideProof(user.id, role, id, true, dto.notes));
  }

  @Post('bills/proofs/:id/reject')
  async reject(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Param('id') id: string,
    @Body() dto: DecisionDto,
  ) {
    return new ResponseDto('Bill proof rejected', await this.bills.decideProof(user.id, role, id, false, dto.notes));
  }

  @Post('bills')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateBillDto })
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Body() dto: CreateBillDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return new ResponseDto('Bill created', await this.bills.create(user.id, role, dto, file));
  }

  @Get('bills')
  @ApiQuery({ name: 'propertyId', required: false, schema: { type: 'string', format: 'uuid' } })
  async list(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Query('propertyId') propertyId?: string) {
    return new ResponseDto('Bills', await this.bills.list(user.id, role, propertyId));
  }

  @Get('bills/:id')
  async get(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Bill', await this.bills.get(user.id, role, id));
  }

  @Post('bills/:id/proofs')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ProofDto })
  @UseInterceptors(FileInterceptor('file'))
  async proof(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Param('id') id: string,
    @Body() dto: ProofDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return new ResponseDto('Bill proof submitted', await this.bills.submitProof(user.id, role, id, dto.amount, file, dto.data, dto.fileName));
  }
}
