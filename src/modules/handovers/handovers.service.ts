import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HandoverStatus, HandoverType, PortalRole, SettlementStatus } from '../../common/enums';
import { PermissionKey } from '../../common/constants/permissions';
import { Handover, HandoverItem, SecurityDepositSettlement, Tenancy } from '../../database/entities';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { settleDeposit } from './deposit.rules';

@Injectable()
export class HandoversService {
  constructor(
    @InjectRepository(Handover) private readonly handovers: Repository<Handover>,
    @InjectRepository(HandoverItem) private readonly items: Repository<HandoverItem>,
    @InjectRepository(SecurityDepositSettlement) private readonly settlements: Repository<SecurityDepositSettlement>,
    @InjectRepository(Tenancy) private readonly tenancies: Repository<Tenancy>,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, role: PortalRole | null, input: {
    tenancyId: string;
    type: HandoverType;
    conditionSummary?: string;
  }) {
    const tenancy = await this.tenancies.findOne({ where: { id: input.tenancyId } });
    if (!tenancy) throw new NotFoundException('Tenancy was not found');
    await this.access.assertPermission(userId, role, tenancy.propertyId, 'HANDOVER_MANAGE', tenancy.id);
    return this.handovers.save(this.handovers.create({
      ...input,
      propertyId: tenancy.propertyId,
      createdByUserId: userId,
      status: HandoverStatus.DRAFT,
    }));
  }

  async addItem(userId: string, role: PortalRole | null, handoverId: string, input: {
    kind: string;
    label: string;
    valueText?: string;
    numericValue?: string;
    unit?: string;
  }) {
    const handover = await this.require(userId, role, handoverId);
    return this.items.save(this.items.create({ handoverId: handover.id, ...input }));
  }

  async confirm(userId: string, role: PortalRole | null, handoverId: string) {
    const handover = await this.require(userId, role, handoverId);
    if (role === PortalRole.TENANT) handover.confirmedByTenantAt = new Date();
    if (role === PortalRole.OWNER) handover.confirmedByOwnerAt = new Date();
    if (handover.confirmedByTenantAt && handover.confirmedByOwnerAt) {
      handover.status = HandoverStatus.CONFIRMED;
    } else {
      handover.status = HandoverStatus.PENDING_CONFIRMATION;
    }
    return this.handovers.save(handover);
  }

  async list(userId: string, role: PortalRole | null, tenancyId: string) {
    if (!tenancyId) throw new BadRequestException('tenancyId is required');
    const tenancy = await this.tenancies.findOne({ where: { id: tenancyId } });
    if (!tenancy) throw new NotFoundException('Tenancy was not found');
    await this.access.assertPermission(userId, role, tenancy.propertyId, this.permissionFor(role), tenancy.id);
    return this.handovers.find({ where: { tenancyId }, order: { createdAt: 'DESC' } });
  }

  async get(userId: string, role: PortalRole | null, id: string) {
    const handover = await this.require(userId, role, id);
    const items = await this.items.find({ where: { handoverId: id }, order: { createdAt: 'ASC' } });
    return { ...handover, items };
  }

  async getSettlement(userId: string, role: PortalRole | null, tenancyId: string) {
    const tenancy = await this.tenancies.findOne({ where: { id: tenancyId } });
    if (!tenancy) throw new NotFoundException('Tenancy was not found');
    await this.access.assertPermission(userId, role, tenancy.propertyId, this.permissionFor(role), tenancy.id);
    const settlement = await this.settlements.findOne({
      where: { tenancyId },
      order: { createdAt: 'DESC' },
    });
    return settlement || {};
  }

  async settle(userId: string, role: PortalRole | null, tenancyId: string, input: {
    depositReceived: string;
    approvedDeductions: string;
    deductionReason?: string;
    currencyCode: string;
    paymentReference?: string;
  }) {
    const tenancy = await this.tenancies.findOne({ where: { id: tenancyId } });
    if (!tenancy) throw new NotFoundException('Tenancy was not found');
    await this.access.assertPermission(userId, role, tenancy.propertyId, 'HANDOVER_MANAGE', tenancy.id);
    let result;
    try {
      result = settleDeposit({
        received: input.depositReceived,
        approvedDeductions: input.approvedDeductions,
        currency: input.currencyCode,
      });
    } catch {
      throw new BadRequestException('Deductions cannot exceed the deposit received');
    }
    const settlement = await this.settlements.save(this.settlements.create({
      tenancyId,
      depositReceived: input.depositReceived,
      deductionAmount: result.deductionAmount,
      deductionReason: input.deductionReason,
      refundAmount: result.refundAmount,
      remainingBalance: result.remainingBalance,
      status: SettlementStatus.APPROVED,
      currencyCode: input.currencyCode,
      paymentReference: input.paymentReference,
      approvedByUserId: userId,
    }));
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'deposit.settled',
      entityType: 'security_deposit_settlement',
      entityId: settlement.id,
      propertyId: tenancy.propertyId,
      tenancyId,
    });
    return settlement;
  }

  private permissionFor(role: PortalRole | null): PermissionKey {
    return role === PortalRole.TENANT ? 'HANDOVER_CONFIRM' : 'HANDOVER_MANAGE';
  }

  private async require(userId: string, role: PortalRole | null, id: string) {
    const handover = await this.handovers.findOne({ where: { id } });
    if (!handover) throw new NotFoundException('Handover was not found');
    await this.access.assertPermission(userId, role, handover.propertyId, this.permissionFor(role), handover.tenancyId);
    return handover;
  }
}
