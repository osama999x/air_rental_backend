import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { ActiveRole, CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { IdentityDocumentSide, IdentityDocumentType, PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { IdentityDocumentsService } from './identity-documents.service';

class IdentityUploadDto {
  @IsEnum(IdentityDocumentType) documentType: IdentityDocumentType;
  @IsEnum(IdentityDocumentSide) side: IdentityDocumentSide;
  @IsString() @MinLength(4) documentNumber: string;
}

@ApiTags('Identity')
@ApiBearerAuth()
@Controller()
export class IdentityDocumentsController {
  constructor(private readonly identity: IdentityDocumentsService) {}

  @Get('users/me/identity-documents')
  async mine(@CurrentUser() user: User) {
    return new ResponseDto('Identity documents', await this.identity.listMine(user.id));
  }

  @Post('users/me/identity-documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: User,
    @Body() dto: IdentityUploadDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return new ResponseDto('Identity document stored', await this.identity.save(user.id, dto, file));
  }

  @Get('tenancies/:id/identity-documents')
  async tenancy(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Identity documents', await this.identity.listForTenancy(user.id, role, id));
  }

  @Post('tenancies/:id/identity-documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadForTenant(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Param('id') id: string,
    @Body() dto: IdentityUploadDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return new ResponseDto('Identity document stored', await this.identity.saveForTenancy(user.id, role, id, dto, file));
  }

  @Get('identity-documents/:id/download')
  download(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return this.identity.download(user.id, role, id);
  }
}
