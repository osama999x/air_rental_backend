import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { fullFileStream } from '../../common/utils/file-stream';
import { assertAllowedUpload } from '../../common/utils/files.util';
import { openBytes, openText, sealBytes, sealText } from '../../common/utils/identity-crypto';
import {
  IdentityDocumentSide,
  IdentityDocumentType,
  PortalRole,
  VerificationStatus,
} from '../../common/enums';
import { IdentityDocument, Tenancy } from '../../database/entities';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { uploadLimitBytes, StorageService } from '../storage/storage.service';

@Injectable()
export class IdentityDocumentsService {
  constructor(
    @InjectRepository(IdentityDocument) private readonly documents: Repository<IdentityDocument>,
    @InjectRepository(Tenancy) private readonly tenancies: Repository<Tenancy>,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  async listMine(userId: string) {
    const rows = await this.documents.find({ where: { userId }, order: { createdAt: 'DESC' } });
    return rows.map((row) => this.present(row, true));
  }

  async save(
    userId: string,
    input: { documentType: IdentityDocumentType; side: IdentityDocumentSide; documentNumber: string },
    file?: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('A photo or PDF of this side is required');
    const number = input.documentNumber.trim();
    if (number.length < 4) throw new BadRequestException('Enter the document number');
    try {
      assertAllowedUpload(file.mimetype, file.size, uploadLimitBytes(this.config));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Unsupported file type');
    }
    const secret = this.secret();
    const sealedFile = sealBytes(file.buffer, secret);
    const sealedNumber = sealText(number, secret);
    const storageKey = await this.storage.save(sealedFile.cipher, file.originalname || 'identity');
    const existing = await this.documents.findOne({
      where: { userId, documentType: input.documentType, side: input.side },
    });
    if (existing) await this.storage.remove(existing.storageKey);
    const payload = {
      userId,
      documentType: input.documentType,
      side: input.side,
      numberCipher: sealedNumber.cipher,
      numberIv: sealedNumber.iv,
      numberTag: sealedNumber.tag,
      fileIv: sealedFile.iv,
      fileTag: sealedFile.tag,
      storageKey,
      mimeType: file.mimetype,
      originalName: (file.originalname || 'identity').slice(0, 180),
      verificationStatus: VerificationStatus.UNVERIFIED,
    };
    const saved = existing
      ? await this.documents.save(Object.assign(existing, payload))
      : await this.documents.save(this.documents.create(payload));
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      action: 'identity.uploaded',
      entityType: 'identity_document',
      entityId: saved.id,
      metadata: { documentType: input.documentType, side: input.side },
    });
    return this.present(saved, true);
  }

  async listForTenancy(userId: string, role: PortalRole | null, tenancyId: string) {
    const tenancy = await this.requireReadableTenancy(userId, role, tenancyId);
    if (!tenancy.tenantUserId) return [];
    const own = role === PortalRole.TENANT && tenancy.tenantUserId === userId;
    const rows = await this.documents.find({
      where: { userId: tenancy.tenantUserId },
      order: { documentType: 'ASC', side: 'ASC' },
    });
    return rows.map((row) => this.present(row, own));
  }

  summaryForUser(userId: string) {
    return this.documents.find({
      where: { userId },
      order: { documentType: 'ASC', side: 'ASC' },
    }).then((rows) => rows.map((row) => this.present(row, false)));
  }

  async download(userId: string, role: PortalRole | null, id: string) {
    const document = await this.documents.findOne({ where: { id } });
    if (!document) throw new NotFoundException('Identity document was not found');
    await this.assertCanRead(userId, role, document.userId);
    const cipher = await this.storage.read(document.storageKey);
    if (!cipher) throw new NotFoundException('Identity document was not found');
    const plain = openBytes(cipher, document.fileIv, document.fileTag, this.secret());
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'identity.downloaded',
      entityType: 'identity_document',
      entityId: id,
    });
    return new StreamableFile(fullFileStream(plain), {
      type: document.mimeType,
      disposition: `attachment; filename="${document.originalName}"`,
      length: plain.length,
    });
  }

  private async requireReadableTenancy(userId: string, role: PortalRole | null, tenancyId: string) {
    const tenancy = await this.tenancies.findOne({ where: { id: tenancyId } });
    if (!tenancy) throw new NotFoundException('Tenancy was not found');
    await this.access.assertProperty(userId, role, tenancy.propertyId);
    if (role === PortalRole.TENANT && tenancy.tenantUserId !== userId) {
      throw new ForbiddenException('You cannot access this tenancy');
    }
    return tenancy;
  }

  private async assertCanRead(userId: string, role: PortalRole | null, ownerUserId: string) {
    if (ownerUserId === userId) return;
    const rows = await this.tenancies.find({ where: { tenantUserId: ownerUserId } });
    for (const row of rows) {
      try {
        await this.access.assertProperty(userId, role, row.propertyId);
        if (role !== PortalRole.TENANT) return;
      } catch {
        continue;
      }
    }
    throw new ForbiddenException('You cannot access this identity document');
  }

  private present(row: IdentityDocument, includeNumber: boolean) {
    return {
      id: row.id,
      documentType: row.documentType,
      side: row.side,
      verificationStatus: row.verificationStatus,
      mimeType: row.mimeType,
      createdAt: row.createdAt,
      ...(includeNumber
        ? { documentNumber: openText(row.numberCipher, row.numberIv, row.numberTag, this.secret()) }
        : {}),
    };
  }

  private secret() {
    return this.config.get<string>('IDENTITY_ENCRYPTION_KEY') || 'development-only-identity-key';
  }
}
