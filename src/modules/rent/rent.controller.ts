import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';
import { Response } from 'express';
import { ActiveRole, CurrentUser } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { PortalRole } from '../../common/enums';
import { User } from '../../database/entities';
import { toCsv, toSimplePdf, toSpreadsheetXml } from './exports.util';
import { RentService } from './rent.service';

class GenerateRentDto {
  @IsUUID() tenancyId: string;
  @IsDateString() from: string;
  @IsDateString() to: string;
}

class ProofDto {
  @IsString() amount: string;
}

class DecisionDto {
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() idempotencyKey?: string;
}

class PaymentDto {
  @IsString() amount: string;
  @IsString() method: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() idempotencyKey?: string;
}

class StatementQuery {
  @IsDateString() from: string;
  @IsDateString() to: string;
  @IsOptional() @IsUUID() propertyId?: string;
  @IsOptional() @IsString() format?: string;
}

@ApiTags('Rent')
@ApiBearerAuth()
@Controller('rent')
export class RentController {
  constructor(private readonly rent: RentService) {}

  @Post('obligations/generate')
  async generate(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Body() dto: GenerateRentDto) {
    return new ResponseDto('Rent schedule generated', await this.rent.generate(user.id, role, dto.tenancyId, dto.from, dto.to));
  }

  @Get('obligations')
  async list(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Query('tenancyId') tenancyId?: string) {
    return new ResponseDto('Rent obligations', await this.rent.list(user.id, role, tenancyId));
  }

  @Post('obligations/:id/proofs')
  @UseInterceptors(FileInterceptor('file'))
  async proof(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Param('id') id: string,
    @Body() dto: ProofDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return new ResponseDto('Proof submitted', await this.rent.submitProof(user.id, role, id, dto.amount, file));
  }

  @Post('proofs/:id/approve')
  async approve(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string, @Body() dto: DecisionDto) {
    return new ResponseDto('Proof approved', await this.rent.decideProof(user.id, role, id, true, dto.notes, dto.idempotencyKey));
  }

  @Post('proofs/:id/reject')
  async reject(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string, @Body() dto: DecisionDto) {
    return new ResponseDto('Proof rejected', await this.rent.decideProof(user.id, role, id, false, dto.notes, dto.idempotencyKey));
  }

  @Post('obligations/:id/payments')
  async pay(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string, @Body() dto: PaymentDto) {
    return new ResponseDto('Payment recorded', await this.rent.recordPayment(user.id, role, id, dto));
  }

  @Post('obligations/:id/remind')
  async remind(@CurrentUser() user: User, @ActiveRole() role: PortalRole, @Param('id') id: string) {
    return new ResponseDto('Reminder sent', await this.rent.remind(user.id, role, id));
  }

  @Get('statements')
  async statement(
    @CurrentUser() user: User,
    @ActiveRole() role: PortalRole,
    @Query() query: StatementQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.rent.statement(user.id, role, query.from, query.to, query.propertyId);
    const flat = rows.map((row) => ({
      period: row.period,
      amount: row.amount,
      paid: row.paid,
      remaining: row.remaining,
      status: row.status,
      currency: row.currency,
      transactionDetails: row.transactions
        .map((tx) => `${tx.amount} ${tx.method} ref ${tx.reference || '-'} due ${tx.dueDate} paid ${tx.paidDate || '-'} ${tx.status}`)
        .join(' | '),
    }));
    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="rent-statement.csv"');
      return toCsv(flat);
    }
    if (query.format === 'xls') {
      res.setHeader('Content-Type', 'application/vnd.ms-excel');
      res.setHeader('Content-Disposition', 'attachment; filename="rent-statement.xls"');
      return toSpreadsheetXml(flat);
    }
    if (query.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="rent-statement.pdf"');
      const lines = ['Air Rental rent statement', ...flat.map((row) => `${row.period} ${row.amount} paid ${row.paid} ${row.status}`)];
      return toSimplePdf(lines);
    }
    return new ResponseDto('Rent statement', rows);
  }
}
