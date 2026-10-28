import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ActiveRole, CurrentUser, Roles } from '../../common/decorators';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { ResponseDto } from '../../common/dto/response';
import { MediaKind, PortalRole, PropertyStatus, PropertyType } from '../../common/enums';
import { User } from '../../database/entities';
import { PropertiesService } from './properties.service';

class CreatePropertyDto {
  @ApiProperty({ example: 'House 12' })
  @IsString() name: string;

  @ApiProperty({ enum: PropertyType, example: PropertyType.HSE })
  @IsEnum(PropertyType) propertyType: PropertyType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID() countryId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() cityId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() region?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() area?: string;

  @ApiProperty({ example: '12 Example Street' })
  @IsString() addressLine: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() postalCode?: string;

  @ApiPropertyOptional({ example: '24.8138' })
  @IsOptional() @IsString() latitude?: string;

  @ApiPropertyOptional({ example: '67.0300' })
  @IsOptional() @IsString() longitude?: string;

  @ApiPropertyOptional({ example: '240' })
  @IsOptional() @IsString() sizeValue?: string;

  @ApiPropertyOptional({ example: 'sqm' })
  @IsOptional() @IsString() measurementUnitCode?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() organizationId?: string;

  @ApiPropertyOptional({ example: 'PKR' })
  @IsOptional() @IsString() currencyCode?: string;

  @ApiPropertyOptional({ example: 'Asia/Karachi' })
  @IsOptional() @IsString() timezone?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean() tenantInsuranceRequired?: boolean;
}

class PropertyQuery extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() countryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() cityId?: string;

  @ApiPropertyOptional({ enum: PropertyType })
  @IsOptional() @IsEnum(PropertyType) propertyType?: PropertyType;

  @ApiPropertyOptional({ enum: PropertyStatus })
  @IsOptional() @IsEnum(PropertyStatus) status?: PropertyStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() organizationId?: string;
}

class TransferDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID() newOwnerUserId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() organizationId?: string;
}

class PropertyMediaDto {
  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  file?: string;

  @ApiPropertyOptional({
    description: 'Base64 file, or a data URL such as data:image/jpeg;base64,... Used when file is omitted. The server writes the decoded bytes to disk and returns a URL.',
  })
  data?: string;

  @ApiPropertyOptional({ example: 'house.jpg' })
  fileName?: string;

  @ApiPropertyOptional({ enum: MediaKind, default: MediaKind.PHOTO })
  kind?: MediaKind;
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

  @Get('media/:id/download')
  downloadMedia(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return this.properties.downloadMedia(user.id, role, id);
  }

  @Delete('media/:id')
  async deleteMedia(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Media deleted', await this.properties.deleteMedia(user.id, role, id));
  }

  @Get(':id')
  async get(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Property', await this.properties.get(user.id, role, id));
  }

  @Delete(':id')
  async remove(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Property deleted', await this.properties.archive(user.id, role, id));
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
  @ApiBody({ type: PropertyMediaDto })
  @UseInterceptors(FileInterceptor('file'))
  async media(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('kind') kind: MediaKind = MediaKind.PHOTO,
    @Body('data') data?: string,
    @Body('fileName') fileName?: string,
  ) {
    return new ResponseDto('Media stored', await this.properties.addMedia(user.id, role, id, file, kind || MediaKind.PHOTO, data, fileName));
  }
}
