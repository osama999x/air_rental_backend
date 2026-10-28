import { BadRequestException, Injectable, NotFoundException, OnModuleInit, StreamableFile } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentOwnerType, InsuranceHolder, PortalRole, VerificationStatus } from '../../common/enums';
import { toIsoDate } from '../../common/utils/dates.util';
import { DocumentRecord, InsurancePolicy, Property } from '../../database/entities';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { JobsService } from '../jobs/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class DocumentsService implements OnModuleInit {
  constructor(
    @InjectRepository(DocumentRecord) private readonly documents: Repository<DocumentRecord>,
    @InjectRepository(InsurancePolicy) private readonly policies: Repository<InsurancePolicy>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.jobs.register('insurance.scan', async () => this.scanInsurance());
  }

  async upload(userId: string, role: PortalRole | null, input: {
    propertyId?: string;
    tenancyId?: string;
    category: string;
    title: string;
    expiresAt?: string;
    identityNumber?: string;
    data?: string;
    fileName?: string;
  }, file?: Express.Multer.File) {
    if (!input.title?.trim() || input.title.trim().length > 180) {
      throw new BadRequestException('Document title must be 180 characters or less');
    }
    if (input.propertyId) {
      await this.access.assertPermission(userId, role, input.propertyId, 'DOCUMENT_MANAGE', input.tenancyId);
    }
    const stored = await this.storage.keep({ file, data: input.data, fileName: input.fileName || input.title });
    if (!stored) throw new BadRequestException('A file is required');
    const document = await this.documents.save(this.documents.create({
      ownerType: input.tenancyId ? DocumentOwnerType.TENANCY : DocumentOwnerType.PROPERTY,
      ownerId: input.tenancyId || input.propertyId || userId,
      propertyId: input.propertyId,
      tenancyId: input.tenancyId,
      category: input.category,
      title: input.title.trim().slice(0, 180),
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      uploadedByUserId: userId,
      verificationStatus: VerificationStatus.UNVERIFIED,
      expiresAt: input.expiresAt,
      identityNumberLast4: input.identityNumber ? input.identityNumber.slice(-4) : null,
    }));
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'document.uploaded',
      entityType: 'document',
      entityId: document.id,
      propertyId: input.propertyId,
      tenancyId: input.tenancyId,
    });
    return document;
  }

  async list(userId: string, role: PortalRole | null, propertyId?: string, tenancyId?: string) {
    if (!propertyId && !tenancyId) {
      throw new BadRequestException('propertyId or tenancyId is required');
    }
    const rows = await this.documents.find({
      where: {
        ...(propertyId ? { propertyId } : {}),
        ...(tenancyId ? { tenancyId } : {}),
      },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const visible = [];
    for (const row of rows) {
      try {
        await this.access.assertDocument(userId, role, row);
        visible.push({
          id: row.id,
          title: row.title,
          category: row.category,
          expiresAt: row.expiresAt,
          uploadedByUserId: row.uploadedByUserId,
          propertyId: row.propertyId,
          tenancyId: row.tenancyId,
          mimeType: row.mimeType,
          createdAt: row.createdAt,
        });
      } catch {
        continue;
      }
    }
    return visible;
  }

  async listInsurance(userId: string, role: PortalRole | null, propertyId: string) {
    if (!propertyId) throw new BadRequestException('propertyId is required');
    await this.access.assertProperty(userId, role, propertyId);
    const property = await this.properties.findOne({ where: { id: propertyId } });
    if (!property) throw new NotFoundException('Property was not found');
    const policies = await this.policies.find({
      where: { propertyId },
      order: { endDate: 'DESC' },
    });
    return {
      tenantInsuranceRequired: property.tenantInsuranceRequired,
      policies,
    };
  }

  async download(userId: string, role: PortalRole | null, id: string) {
    const document = await this.documents.findOne({ where: { id } });
    if (!document) throw new NotFoundException('Document was not found');
    await this.access.assertDocument(userId, role, document);
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'document.downloaded',
      entityType: 'document',
      entityId: id,
      propertyId: document.propertyId,
      tenancyId: document.tenancyId,
    });
    return new StreamableFile(this.storage.open(document.storageKey), {
      type: document.mimeType,
      disposition: `attachment; filename="${document.title}"`,
    });
  }

  async addInsurance(userId: string, role: PortalRole | null, input: {
    holderRole: InsuranceHolder;
    propertyId: string;
    tenancyId?: string;
    providerName: string;
    policyNumber: string;
    startDate: string;
    endDate: string;
    documentId?: string;
  }) {
    await this.access.assertPermission(userId, role, input.propertyId, 'INSURANCE_MANAGE', input.tenancyId);
    return this.policies.save(this.policies.create({
      ...input,
      userId,
      status: VerificationStatus.PENDING,
    }));
  }

  private async scanInsurance() {
    const today = toIsoDate(new Date());
    const policies = await this.policies.find();
    for (const policy of policies) {
      if (policy.endDate < today || policy.endDate > toIsoDate(new Date(Date.now() + 30 * 86400000))) continue;
      const property = await this.properties.findOne({ where: { id: policy.propertyId } });
      await this.notifications.notify({
        userId: policy.userId,
        type: 'insurance.expiry',
        title: 'Insurance expiry',
        body: `Policy ${policy.policyNumber} for ${property?.visibleCode || 'a property'} expires on ${policy.endDate}.`,
        dedupeParts: [policy.id, policy.endDate],
      });
    }
    const tomorrow = this.jobs.nextDay();
    await this.jobs.enqueue('insurance.scan', {}, { runAt: tomorrow, dedupeKey: `insurance.scan:${toIsoDate(tomorrow)}` });
  }
}
