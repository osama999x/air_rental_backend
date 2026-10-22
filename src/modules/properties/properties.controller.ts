import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ActiveRole, CurrentUser, Roles } from '../../common/decorators';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { ResponseDto } from '../../common/dto/response';
import { MediaKind, PortalRole, PropertyStatus, PropertyType } from '../../common/enums';
import { User } from '../../database/entities';
import { PropertiesService } from './properties.service';

class CreatePropertyDto {
  @IsString() name: string;
  @IsEnum(PropertyType) propertyType: PropertyType;
  @IsUUID() countryId: string;
  @IsOptional() @IsUUID() cityId?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() area?: string;
  @IsString() addressLine: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() latitude?: string;
  @IsOptional() @IsString() longitude?: string;
  @IsOptional() @IsString() sizeValue?: string;
  @IsOptional() @IsString() measurementUnitCode?: string;
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsBoolean() tenantInsuranceRequired?: boolean;
}

class PropertyQuery extends PageQueryDto {
  @IsOptional() @IsUUID() countryId?: string;
  @IsOptional() @IsUUID() cityId?: string;
  @IsOptional() @IsEnum(PropertyType) propertyType?: PropertyType;
  @IsOptional() @IsEnum(PropertyStatus) status?: PropertyStatus;
  @IsOptional() @IsUUID() organizationId?: string;
}

class TransferDto {
  @IsUUID() newOwnerUserId: string;
  @IsOptional() @IsUUID() organizationId?: string;
}

@ApiTags('Properties')
@ApiBearerAuth()
@Controller('properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Roles(PortalRole.OWNER)
  @Post()
  async create(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Body() dto: CreatePropertyDto) {
    return new ResponseDto('Property created', await this.properties.create(user.id, role, dto));
  }

  @Get()
  async list(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Query() query: PropertyQuery) {
    return new ResponseDto('Properties', await this.properties.list(user.id, role, query));
  }

  @Get(':id')
  async get(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Property', await this.properties.get(user.id, role, id));
  }

  @Patch(':id')
  async update(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string, @Body() dto: CreatePropertyDto) {
    return new ResponseDto('Property updated', await this.properties.update(user.id, role, id, dto));
  }

  @Post(':id/transfer')
  async transfer(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string, @Body() dto: TransferDto) {
    return new ResponseDto('Ownership transferred', await this.properties.transfer(user.id, role, id, dto.newOwnerUserId, dto.organizationId));
  }

  @Post(':id/media')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async media(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('kind') kind: MediaKind = MediaKind.PHOTO,
  ) {
    return new ResponseDto('Media stored', await this.properties.addMedia(user.id, role, id, file, kind || MediaKind.PHOTO));
  }
}
