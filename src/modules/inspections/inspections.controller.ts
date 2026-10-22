import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';
import { ActiveRole, CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { InspectionsService } from './inspections.service';

class CreateInspectionDto {
  @IsUUID() propertyId: string;
  @IsOptional() @IsUUID() tenancyId?: string;
  @IsOptional() @IsUUID() inspectorUserId?: string;
  @IsDateString() scheduledAt: string;
  @IsOptional() @IsString() comments?: string;
}

class ItemDto {
  @IsString() kind: string;
  @IsString() label: string;
  @IsOptional() @IsString() valueText?: string;
  @IsOptional() @IsString() numericValue?: string;
  @IsOptional() @IsString() unit?: string;
}

class CompleteDto {
  @IsString() generalCondition: string;
  @IsOptional() @IsString() comments?: string;
}

@ApiTags('Inspections')
@ApiBearerAuth()
@Controller('inspections')
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Post()
  async create(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Body() dto: CreateInspectionDto) {
    return new ResponseDto('Inspection scheduled', await this.inspections.create(user.id, role, dto));
  }

  @Get()
  async list(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Query('propertyId') propertyId: string,
  ) {
    return new ResponseDto('Inspections', await this.inspections.list(user.id, role, propertyId));
  }

  @Get(':id')
  async get(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Inspection', await this.inspections.get(user.id, role, id));
  }

  @Post(':id/items')
  async item(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string, @Body() dto: ItemDto) {
    return new ResponseDto('Inspection item added', await this.inspections.addItem(user.id, role, id, dto));
  }

  @Post(':id/complete')
  async complete(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string, @Body() dto: CompleteDto) {
    return new ResponseDto('Inspection completed', await this.inspections.complete(user.id, role, id, dto.generalCondition, dto.comments));
  }
}
