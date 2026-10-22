import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedgerStatus, PortalRole } from '../../common/enums';
import { sumAmounts, zeroAmount } from '../../common/utils/money.util';
import { MaintenanceRequest, Property, PropertyExpense, RentObligation, RentPayment } from '../../database/entities';
import { AccessService } from '../access/access.service';
import { confirmedIncome, netIncome } from '../rent/rent.rules';
import { MaintenanceStatus } from '../../common/enums';

@Injectable()
export class FinancesService {
  constructor(
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(RentObligation) private readonly obligations: Repository<RentObligation>,
    @InjectRepository(RentPayment) private readonly payments: Repository<RentPayment>,
    @InjectRepository(PropertyExpense) private readonly expenses: Repository<PropertyExpense>,
    @InjectRepository(MaintenanceRequest) private readonly maintenance: Repository<MaintenanceRequest>,
    private readonly access: AccessService,
  ) {}

  async summary(userId: string, role: PortalRole | null, propertyId: string, from?: string, to?: string) {
    await this.access.assertFinance(userId, role, propertyId);
    const property = await this.properties.findOne({ where: { id: propertyId } });
    if (!property) throw new BadRequestException('Property was not found');
    const currency = property.currencyCode;
    const obligations = (await this.obligations.find({ where: { propertyId } })).filter((row) => {
      const key = row.dueDate;
      return (!from || key >= from) && (!to || key <= to);
    });
    const payments = [];
    for (const obligation of obligations) {
      if (obligation.currencyCode !== currency) {
        throw new BadRequestException('This summary does not combine different currencies');
      }
      payments.push(...await this.payments.find({ where: { obligationId: obligation.id, status: LedgerStatus.CONFIRMED } }));
    }
    const expenseRows = (await this.expenses.find({ where: { propertyId, status: 'APPROVED' } })).filter((row) => {
      return (!from || row.incurredOn >= from) && (!to || row.incurredOn <= to) && row.currencyCode === currency;
    });
    const maintenanceRows = (await this.maintenance.find({
      where: { propertyId, status: MaintenanceStatus.COMPLETED },
    })).filter((row) => row.finalAmount && row.currencyCode === currency);
    const income = confirmedIncome(payments, currency);
    const expenseTotal = sumAmounts([
      ...expenseRows.map((row) => row.amount),
      ...maintenanceRows.map((row) => row.finalAmount as string),
    ], currency);
    return {
      propertyId,
      currency,
      confirmedRentIncome: income,
      expenses: expenseTotal,
      netIncome: netIncome(income || zeroAmount(currency), expenseTotal, currency),
      formula: 'confirmed rent income minus approved property expenses and completed maintenance final amounts',
    };
  }

  async addExpense(userId: string, role: PortalRole | null, input: {
    propertyId: string;
    category: string;
    amount: string;
    currencyCode: string;
    incurredOn: string;
    description?: string;
  }) {
    await this.access.assertFinance(userId, role, input.propertyId);
    return this.expenses.save(this.expenses.create({
      ...input,
      source: 'MANUAL',
      status: 'APPROVED',
      createdByUserId: userId,
    }));
  }
}
