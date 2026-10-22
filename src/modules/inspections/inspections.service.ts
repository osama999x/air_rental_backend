import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InspectionStatus, PortalRole } from '../../common/enums';
import { Inspection, InspectionItem } from '../../database/entities';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class InspectionsService {
  constructor(
    @InjectRepository(Inspection) private readonly inspections: Repository<Inspection>,
    @InjectRepository(InspectionItem) private readonly items: Repository<InspectionItem>,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, role: PortalRole | null, input: {
    propertyId: string;
    tenancyId?: string;
    inspectorUserId?: string;
    scheduledAt: string;
    comments?: string;
  }) {
    await this.access.assertPermission(userId, role, input.propertyId, 'INSPECTION_MANAGE', input.tenancyId);
    return this.inspections.save(this.inspections.create({
      ...input,
      inspectorUserId: input.inspectorUserId || userId,
      scheduledAt: new Date(input.scheduledAt),
      createdByUserId: userId,
      status: InspectionStatus.SCHEDULED,
    }));
  }

  async addItem(userId: string, role: PortalRole | null, inspectionId: string, input: {
    kind: string;
    label: string;
    valueText?: string;
    numericValue?: string;
    unit?: string;
  }) {
    const inspection = await this.require(userId, role, inspectionId);
    return this.items.save(this.items.create({ inspectionId: inspection.id, ...input }));
  }

  async complete(userId: string, role: PortalRole | null, inspectionId: string, generalCondition: string, comments?: string) {
    const inspection = await this.require(userId, role, inspectionId);
    inspection.status = InspectionStatus.COMPLETED;
    inspection.completedAt = new Date();
    inspection.generalCondition = generalCondition;
    inspection.comments = comments;
    await this.inspections.save(inspection);
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'inspection.completed',
      entityType: 'inspection',
      entityId: inspection.id,
      propertyId: inspection.propertyId,
      tenancyId: inspection.tenancyId,
    });
    return inspection;
  }

  async list(userId: string, role: PortalRole | null, propertyId: string) {
    if (!propertyId) throw new BadRequestException('propertyId is required');
    await this.access.assertPermission(userId, role, propertyId, 'INSPECTION_MANAGE');
    return this.inspections.find({
      where: { propertyId },
      order: { scheduledAt: 'DESC' },
      select: ['id', 'propertyId', 'tenancyId', 'status', 'scheduledAt', 'completedAt', 'generalCondition', 'createdAt'],
    });
  }

  async get(userId: string, role: PortalRole | null, id: string) {
    const inspection = await this.require(userId, role, id);
    const items = await this.items.find({ where: { inspectionId: id } });
    return { ...inspection, items };
  }

  private async require(userId: string, role: PortalRole | null, id: string) {
    const inspection = await this.inspections.findOne({ where: { id } });
    if (!inspection) throw new NotFoundException('Inspection was not found');
    await this.access.assertPermission(userId, role, inspection.propertyId, 'INSPECTION_MANAGE', inspection.tenancyId || undefined);
    return inspection;
  }
}
