import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { MediaKind, PortalRole, PropertyStatus, PropertyType } from '../../common/enums';
import { assertAllowedUpload } from '../../common/utils/files.util';
import { Country, Property, PropertyCodeSequence, PropertyMedia, PropertyOwnershipHistory, Tenancy } from '../../database/entities';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { allocatePropertyCode } from './property-code';
import { ConfigService } from '@nestjs/config';
import { uploadLimitBytes } from '../storage/storage.service';
import { TenancyStatus } from '../../common/enums';

@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(PropertyMedia) private readonly media: Repository<PropertyMedia>,
    @InjectRepository(Country) private readonly countries: Repository<Country>,
    @InjectRepository(Tenancy) private readonly tenancies: Repository<Tenancy>,
    private readonly dataSource: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  async create(userId: string, role: PortalRole | null, input: {
    name: string;
    propertyType: PropertyType;
    countryId: string;
    cityId?: string;
    region?: string;
    area?: string;
    addressLine: string;
    postalCode?: string;
    latitude?: string;
    longitude?: string;
    sizeValue?: string;
    measurementUnitCode?: string;
    facilities?: string[];
    organizationId?: string;
    currencyCode?: string;
    timezone?: string;
    tenantInsuranceRequired?: boolean;
  }) {
    if (role !== PortalRole.OWNER) {
      throw new BadRequestException('Properties are created from the owner portal');
    }
    const country = await this.countries.findOne({ where: { id: input.countryId } });
    if (!country) throw new BadRequestException('Select a valid country. Country is not inferred from coordinates.');
    return this.dataSource.transaction(async (manager) => {
      const visibleCode = await allocatePropertyCode({
        lock: async (type) => {
          let row = await manager.findOne(PropertyCodeSequence, {
            where: { propertyType: type },
            lock: { mode: 'pessimistic_write' },
          });
          if (!row) {
            try {
              row = await manager.save(manager.create(PropertyCodeSequence, { propertyType: type, lastNumber: 0 }));
            } catch {
              row = await manager.findOne(PropertyCodeSequence, {
                where: { propertyType: type },
                lock: { mode: 'pessimistic_write' },
              });
            }
          }
          return row?.lastNumber ?? 0;
        },
        save: async (type, lastNumber) => {
          await manager.update(PropertyCodeSequence, { propertyType: type }, { lastNumber });
        },
      }, input.propertyType);
      const property = await manager.save(manager.create(Property, {
        ...input,
        visibleCode,
        ownerUserId: userId,
        status: PropertyStatus.VACANT,
        currencyCode: input.currencyCode || country.defaultCurrencyCode,
        timezone: input.timezone || country.defaultTimezone,
      }));
      await manager.save(manager.create(PropertyOwnershipHistory, {
        propertyId: property.id,
        ownerUserId: userId,
        organizationId: input.organizationId,
        startedAt: new Date(),
        reason: 'created',
      }));
      await this.audit.record({
        actorUserId: userId,
        actorType: 'USER',
        activeRole: role,
        action: 'property.created',
        entityType: 'property',
        entityId: property.id,
        propertyId: property.id,
        metadata: { visibleCode },
      });
      return property;
    });
  }

  async list(userId: string, role: PortalRole | null, query: {
    countryId?: string;
    cityId?: string;
    propertyType?: PropertyType;
    status?: PropertyStatus;
    organizationId?: string;
    page: number;
    pageSize: number;
    search?: string;
  }) {
    const actor = await this.access.actor(userId, role);
    if (!role) return { items: [], total: 0, page: query.page, pageSize: query.pageSize, pageCount: 1 };
    const ids = role === PortalRole.TENANT
      ? actor.tenantPropertyIds
      : role === PortalRole.MANAGER
        ? actor.assignments.filter((item) => item.status === 'ACTIVE').flatMap((item) => item.propertyIds)
        : actor.ownedPropertyIds;
    if (!ids.length) return { items: [], total: 0, page: query.page, pageSize: query.pageSize, pageCount: 1 };
    const qb = this.properties.createQueryBuilder('property')
      .where('property.id IN (:...ids)', { ids })
      .andWhere('property.archivedAt IS NULL');
    if (query.countryId) qb.andWhere('property.countryId = :countryId', { countryId: query.countryId });
    if (query.cityId) qb.andWhere('property.cityId = :cityId', { cityId: query.cityId });
    if (query.propertyType) qb.andWhere('property.propertyType = :propertyType', { propertyType: query.propertyType });
    if (query.status) qb.andWhere('property.status = :status', { status: query.status });
    if (query.organizationId) qb.andWhere('property.organizationId = :organizationId', { organizationId: query.organizationId });
    if (query.search) qb.andWhere('(property.name LIKE :search OR property.visibleCode LIKE :search)', { search: `%${query.search}%` });
    const [items, total] = await qb.orderBy('property.createdAt', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();
    return { items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(total / query.pageSize)) };
  }

  async get(userId: string, role: PortalRole | null, id: string) {
    await this.access.assertProperty(userId, role, id);
    const property = await this.properties.findOne({ where: { id, archivedAt: IsNull() } });
    if (!property) throw new NotFoundException('Property was not found');
    const photos = await this.media.find({ where: { propertyId: id } });
    return { ...property, media: photos };
  }

  async update(userId: string, role: PortalRole | null, id: string, patch: Partial<Property>) {
    await this.access.assertPermission(userId, role, id, 'PROPERTY_MANAGE');
    delete (patch as any).visibleCode;
    delete (patch as any).id;
    delete (patch as any).ownerUserId;
    await this.properties.update({ id }, patch);
    return this.get(userId, role, id);
  }

  async transfer(userId: string, role: PortalRole | null, id: string, newOwnerUserId: string, organizationId?: string) {
    await this.access.assertPermission(userId, role, id, 'PROPERTY_MANAGE');
    const property = await this.properties.findOne({ where: { id } });
    if (!property) throw new NotFoundException('Property was not found');
    await this.dataSource.transaction(async (manager) => {
      await manager.update(PropertyOwnershipHistory, { propertyId: id, endedAt: IsNull() }, { endedAt: new Date() });
      await manager.update(Property, { id }, { ownerUserId: newOwnerUserId, organizationId: organizationId || null });
      await manager.save(manager.create(PropertyOwnershipHistory, {
        propertyId: id,
        ownerUserId: newOwnerUserId,
        organizationId,
        startedAt: new Date(),
        reason: 'transfer',
      }));
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'property.ownership_transferred',
      entityType: 'property',
      entityId: id,
      propertyId: id,
      metadata: { newOwnerUserId },
    });
    return this.properties.findOne({ where: { id } });
  }

  async addMedia(userId: string, role: PortalRole | null, id: string, file: Express.Multer.File, kind: MediaKind) {
    await this.access.assertPermission(userId, role, id, 'PROPERTY_MANAGE');
    assertAllowedUpload(file.mimetype, file.size, uploadLimitBytes(this.config));
    const storageKey = await this.storage.save(file.buffer, file.originalname);
    return this.media.save(this.media.create({
      propertyId: id,
      storageKey,
      mimeType: file.mimetype,
      kind,
      originalName: file.originalname,
    }));
  }

  async reconcileStatus(propertyId: string) {
    const active = await this.tenancies.count({ where: { propertyId, status: TenancyStatus.ACTIVE } });
    await this.properties.update(
      { id: propertyId },
      { status: active > 0 ? PropertyStatus.RENTED : PropertyStatus.VACANT },
    );
  }
}
