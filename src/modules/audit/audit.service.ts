import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities';

export interface AuditInput {
  actorUserId?: string | null;
  actorAdminId?: string | null;
  actorType: 'USER' | 'ADMIN' | 'SYSTEM';
  activeRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  propertyId?: string | null;
  tenancyId?: string | null;
  outcome?: 'SUCCESS' | 'FAILURE';
  requestId?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
  ) {}

  async listForProperty(propertyId: string) {
    const rows = await this.logs.find({
      where: { propertyId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      activeRole: row.activeRole,
      outcome: row.outcome,
      tenancyId: row.tenancyId,
      createdAt: row.createdAt,
    }));
  }

  async record(input: AuditInput): Promise<void> {
    await this.logs.save(
      this.logs.create({
        ...input,
        outcome: input.outcome || 'SUCCESS',
        metadata: this.scrub(input.metadata),
      }),
    );
  }

  private scrub(metadata?: AuditInput['metadata']) {
    if (!metadata) return null;
    const blocked = ['password', 'otp', 'token', 'secret', 'authorization', 'card', 'cvv'];
    return Object.fromEntries(
      Object.entries(metadata).filter(
        ([key]) => !blocked.some((word) => key.toLowerCase().includes(word)),
      ),
    );
  }
}
