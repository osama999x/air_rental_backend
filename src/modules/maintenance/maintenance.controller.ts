import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ActiveRole, CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { MaintenanceStatus, PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { MaintenanceService } from './maintenance.service';

class CreateMaintenanceDto {
  @IsUUID() propertyId: string;
  @IsOptional() @IsUUID() tenancyId?: string;
  @IsString() description: string;
  @IsString() category: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() preferredAccessTime?: string;

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

class TransitionDto {
  @IsEnum(MaintenanceStatus) status: MaintenanceStatus;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() approvedAmount?: string;
}

@ApiTags('Maintenance')
@ApiBearerAuth()
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateMaintenanceDto })
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Body() dto: CreateMaintenanceDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return new ResponseDto('Maintenance request created', await this.maintenance.create(user.id, role, dto, file));
  }

  @Get()
  async list(@CurrentUser() user: User, @ActiveRole() role: PortalRole) {
    return new ResponseDto('Maintenance requests', await this.maintenance.list(user.id, role));
  }

  @Get('attachments/:id/download')
  download(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return this.maintenance.downloadAttachment(user.id, role, id);
  }

  @Get(':id')
  async get(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Maintenance request', await this.maintenance.get(user.id, role, id));
  }

  @Post(':id/attachments')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async attach(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
    @Body('data') data?: string,
    @Body('fileName') fileName?: string,
  ) {
    return new ResponseDto('Attachment stored', await this.maintenance.attach(user.id, role, id, file, data, fileName));
  }

  @Post(':id/status')
  async status(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string, @Body() dto: TransitionDto) {
    return new ResponseDto('Maintenance updated', await this.maintenance.transition(user.id, role, id, dto.status, dto.note, dto.approvedAmount));
  }
}
