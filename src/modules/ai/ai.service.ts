import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PortalRole } from '../../common/enums';
import { AiExtraction, DocumentRecord, Property } from '../../database/entities';
import { AccessService } from '../access/access.service';
import { scopeByProperty } from '../access/access.policy';

@Injectable()
export class AiService {
  constructor(
    private readonly config: ConfigService,
    private readonly access: AccessService,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(DocumentRecord) private readonly documents: Repository<DocumentRecord>,
    @InjectRepository(AiExtraction) private readonly extractions: Repository<AiExtraction>,
  ) {}

  status() {
    return {
      configured: Boolean(this.config.get('AI_API_KEY') && this.config.get('AI_BASE_URL')),
      provider: this.config.get('AI_PROVIDER') || 'unconfigured',
    };
  }

  async ask(userId: string, role: PortalRole | null, question: string) {
    this.assertConfigured();
    const actor = await this.access.actor(userId, role);
    const properties = scopeByProperty(
      actor,
      (await this.properties.find()).map((property) => ({
        propertyId: property.id,
        visibleCode: property.visibleCode,
        name: property.name,
        status: property.status,
        currencyCode: property.currencyCode,
      })),
      new Date(),
    );
    return {
      configured: true,
      answer: null,
      contextPropertyIds: properties.map((property) => property.propertyId),
      questionReceived: Boolean(question),
      note: 'The provider contract is ready. A live completion is not sent until AI_API_KEY and AI_BASE_URL are set and a provider test succeeds.',
    };
  }

  async extract(userId: string, role: PortalRole | null, documentId: string) {
    const document = await this.documents.findOne({ where: { id: documentId } });
    if (!document?.propertyId) throw new ServiceUnavailableException('Document is not available for extraction');
    await this.access.assertDocument(userId, role, document);
    if (!this.status().configured) {
      throw new ServiceUnavailableException('AI extraction is not configured');
    }
    const saved = await this.extractions.save(this.extractions.create({
      userId,
      sourceType: 'document',
      sourceId: documentId,
      fields: { provider: null, amount: null, dueDate: null },
      confidence: '0.0000',
      verified: false,
    }));
    return {
      extractionId: saved.id,
      verified: false,
      confidence: saved.confidence,
      fields: saved.fields,
      note: 'Extracted values are unverified and are not applied to financial records.',
    };
  }

  private assertConfigured() {
    if (!this.status().configured) {
      throw new ServiceUnavailableException('AI provider is not configured');
    }
  }
}
