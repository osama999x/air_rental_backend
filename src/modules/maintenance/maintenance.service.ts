import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintenanceStatus, PortalRole } from '../../common/enums';
import { MaintenanceAttachment, MaintenanceEvent, MaintenanceRequest, Property } from '../../database/entities';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';

const FLOW = [
  MaintenanceStatus.NEW,
  MaintenanceStatus.APPROVED,
  MaintenanceStatus.ASSIGNED,
  MaintenanceStatus.IN_PROGRESS,
  MaintenanceStatus.COMPLETED,
];

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(MaintenanceRequest) private readonly requests: Repository<MaintenanceRequest>,
    @InjectRepository(MaintenanceEvent) private readonly events: Repository<MaintenanceEvent>,
    @InjectRepository(MaintenanceAttachment) private readonly attachments: Repository<MaintenanceAttachment>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async create(userId: string, role: PortalRole | null, input: {
    propertyId: string;
    tenancyId?: string;
    description: string;
    category: string;
    priority?: string;
    preferredAccessTime?: string;
    currencyCode?: string;
    data?: string;
    fileName?: string;
  }, file?: Express.Multer.File) {
    const { data, fileName, ...fields } = input;
    await this.access.assertPermission(userId, role, fields.propertyId, 'MAINTENANCE_CREATE', fields.tenancyId);
    const property = await this.properties.findOne({ where: { id: fields.propertyId } });
    const request = await this.requests.save(this.requests.create({
      ...fields,
      requestedByUserId: userId,
      currencyCode: input.currencyCode || property?.currencyCode || 'USD',
      status: MaintenanceStatus.NEW,
    }));
    await this.events.save(this.events.create({
      requestId: request.id,
      actorUserId: userId,
      toStatus: MaintenanceStatus.NEW,
      note: 'created',
    }));
    if (file || data) await this.attach(userId, role, request.id, file, data, fileName);
    return request;
  }

  async transition(userId: string, role: PortalRole | null, id: string, toStatus: MaintenanceStatus, note?: string, approvedAmount?: string) {
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Maintenance request was not found');
    if (toStatus === MaintenanceStatus.REJECTED || toStatus === MaintenanceStatus.CANCELLED) {
      if (!note) throw new BadRequestException('A reason is required');
      await this.access.assertPermission(userId, role, request.propertyId, 'MAINTENANCE_REVIEW', request.tenancyId || undefined);
    } else if (toStatus === MaintenanceStatus.APPROVED || approvedAmount) {
      await this.access.assertSpend(
        userId,
        role,
        request.propertyId,
        approvedAmount || request.estimateAmount || '0.00',
        request.currencyCode,
      );
    } else {
      await this.access.assertPermission(userId, role, request.propertyId, 'MAINTENANCE_REVIEW', request.tenancyId || undefined);
    }
    const from = request.status;
    if (FLOW.includes(from) && FLOW.includes(toStatus) && FLOW.indexOf(toStatus) < FLOW.indexOf(from)) {
      throw new BadRequestException('That status transition is not allowed');
    }
    request.status = toStatus;
    if (approvedAmount) request.approvedAmount = approvedAmount;
    if (toStatus === MaintenanceStatus.REJECTED) request.rejectionReason = note;
    await this.requests.save(request);
    await this.events.save(this.events.create({
      requestId: id,
      actorUserId: userId,
      fromStatus: from,
      toStatus,
      note,
    }));
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'maintenance.updated',
      entityType: 'maintenance_request',
      entityId: id,
      propertyId: request.propertyId,
      tenancyId: request.tenancyId,
      metadata: { toStatus },
    });
    return request;
  }

  async list(userId: string, role: PortalRole | null) {
    const rows = await this.requests.find({ order: { createdAt: 'DESC' }, take: 200 });
    const visible = [];
    for (const row of rows) {
      try {
        await this.access.assertProperty(userId, role, row.propertyId);
        visible.push(row);
      } catch {
        continue;
      }
    }
    return visible;
  }

  async get(userId: string, role: PortalRole | null, id: string) {
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Maintenance request was not found');
    await this.access.assertProperty(userId, role, request.propertyId);
    const events = await this.events.find({ where: { requestId: id }, order: { createdAt: 'ASC' } });
    const attachments = await this.attachments.find({ where: { requestId: id }, order: { createdAt: 'ASC' } });
    return {
      ...request,
      events,
      attachments: attachments.map((file) => this.presentAttachment(file)),
    };
  }

  async attach(userId: string, role: PortalRole | null, id: string, file?: Express.Multer.File, data?: string, fileName?: string) {
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Maintenance request was not found');
    await this.access.assertProperty(userId, role, request.propertyId);
    const stored = await this.storage.keep({ file, data, fileName });
    if (!stored) throw new BadRequestException('A file is required');
    const saved = await this.attachments.save(this.attachments.create({
      requestId: id,
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      originalName: stored.originalName,
    }));
    return {
      ...this.presentAttachment(saved),
      url: this.storage.publicUrl(`maintenance/attachments/${saved.id}/download`),
    };
  }

  async downloadAttachment(userId: string, role: PortalRole | null, id: string) {
    const file = await this.attachments.findOne({ where: { id } });
    if (!file) throw new NotFoundException('Attachment was not found');
    const request = await this.requests.findOne({ where: { id: file.requestId } });
    if (!request) throw new NotFoundException('Maintenance request was not found');
    await this.access.assertProperty(userId, role, request.propertyId);
    return this.storage.deliver(file.storageKey, file.mimeType, file.originalName || 'attachment', false);
  }

  private presentAttachment(file: MaintenanceAttachment) {
    return {
      id: file.id,
      mimeType: file.mimeType,
      originalName: file.originalName,
      createdAt: file.createdAt,
    };
  }
}
