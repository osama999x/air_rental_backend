import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ActiveRole, CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { InsuranceHolder, PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { DocumentsService } from './documents.service';

class UploadDocumentDto {
  @IsOptional() @IsUUID() propertyId?: string;
  @IsOptional() @IsUUID() tenancyId?: string;
  @IsString() category: string;
  @IsString() title: string;
  @IsOptional() @IsString() expiresAt?: string;
  @IsOptional() @IsString() identityNumber?: string;

  @ApiProperty({ type: 'string', format: 'binary' })
  file: string;
}

class InsuranceDto {
  @IsEnum(InsuranceHolder) holderRole: InsuranceHolder;
  @IsUUID() propertyId: string;
  @IsOptional() @IsUUID() tenancyId?: string;
  @IsString() providerName: string;
  @IsString() policyNumber: string;
  @IsString() startDate: string;
  @IsString() endDate: string;
  @IsOptional() @IsUUID() documentId?: string;
}

@ApiTags('Documents')
@ApiBearerAuth()
@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('documents')
  @ApiQuery({ name: 'propertyId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'tenancyId', required: false, schema: { type: 'string', format: 'uuid' } })
  async list(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Query('propertyId') propertyId?: string,
    @Query('tenancyId') tenancyId?: string,
  ) {
    return new ResponseDto('Documents', await this.documents.list(user.id, role, propertyId, tenancyId));
  }

  @Get('insurance')
  @ApiQuery({ name: 'propertyId', required: true, schema: { type: 'string', format: 'uuid' } })
  async insuranceList(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Query('propertyId') propertyId: string,
  ) {
    return new ResponseDto('Insurance', await this.documents.listInsurance(user.id, role, propertyId));
  }

  @Post('documents')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadDocumentDto })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return new ResponseDto('Document stored', await this.documents.upload(user.id, role, dto, file));
  }

  @Get('documents/:id/download')
  download(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return this.documents.download(user.id, role, id);
  }

  @Post('insurance')
  async insurance(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Body() dto: InsuranceDto) {
    return new ResponseDto('Insurance recorded', await this.documents.addInsurance(user.id, role, dto));
  }
}
