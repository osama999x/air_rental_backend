import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { MediaKind, PortalRole, PropertyStatus, PropertyType } from '../../common/enums';
import { City, Country, Property, PropertyCodeSequence, PropertyMedia, PropertyOwnershipHistory, Tenancy } from '../../database/entities';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { allocatePropertyCode } from './property-code';
import { TenancyStatus } from '../../common/enums';

@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(PropertyMedia) private readonly media: Repository<PropertyMedia>,
    @InjectRepository(Country) private readonly countries: Repository<Country>,
    @InjectRepository(City) private readonly cities: Repository<City>,
    @InjectRepository(Tenancy) private readonly tenancies: Repository<Tenancy>,
    private readonly dataSource: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
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
    if (!input.name?.trim() || input.name.trim().length > 180) {
      throw new BadRequestException('Property name must be 180 characters or less');
    }
    if (input.addressLine && input.addressLine.length > 255) {
      throw new BadRequestException('Address must be 255 characters or less');
    }
    const country = await this.countries.findOne({ where: { id: input.countryId } });
    if (!country) throw new BadRequestException('Select a valid country. Country is not inferred from coordinates.');
    const created = await this.dataSource.transaction(async (manager) => {
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
    const [presented] = await this.withPlaces([created]);
    return presented;
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
    return {
      items: await this.withPlaces(items),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async get(userId: string, role: PortalRole | null, id: string) {
    await this.access.assertProperty(userId, role, id);
    const property = await this.properties.findOne({ where: { id, archivedAt: IsNull() } });
    if (!property) throw new NotFoundException('Property was not found');
    const photos = await this.media.find({ where: { propertyId: id }, order: { createdAt: 'ASC' } });
    const live = await this.usableMedia(photos);
    const [presented] = await this.withPlaces([property]);
    return { ...presented, media: live.map((file) => this.mediaView(file)) };
  }

  async archive(userId: string, role: PortalRole | null, id: string) {
    await this.access.assertPermission(userId, role, id, 'PROPERTY_MANAGE');
    const property = await this.properties.findOne({ where: { id, archivedAt: IsNull() } });
    if (!property) throw new NotFoundException('Property was not found');
    const active = await this.tenancies.count({ where: { propertyId: id, status: TenancyStatus.ACTIVE } });
    if (active > 0) {
      throw new BadRequestException('End the active tenancy before deleting this property');
    }
    const archivedAt = new Date();
    await this.properties.update({ id }, { archivedAt });
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      activeRole: role,
      action: 'property.archived',
      entityType: 'property',
      entityId: id,
      propertyId: id,
      metadata: { visibleCode: property.visibleCode },
    });
    return { id, archivedAt };
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
    const updated = await this.properties.findOne({ where: { id } });
    if (!updated) throw new NotFoundException('Property was not found');
    const [presented] = await this.withPlaces([updated]);
    return presented;
  }

  async addMedia(
    userId: string,
    role: PortalRole | null,
    id: string,
    file: Express.Multer.File | undefined,
    kind: MediaKind,
    data?: string,
    fileName?: string,
  ) {
    await this.access.assertPermission(userId, role, id, 'PROPERTY_MANAGE');
    const stored = await this.storage.keep({ file, data, fileName });
    if (!stored) throw new BadRequestException('Choose a file');
    const duplicate = await this.sameRecentFile(id, stored.originalName, stored.size);
    if (duplicate) {
      await this.storage.remove(stored.storageKey);
      return this.mediaView(duplicate);
    }
    const saved = await this.media.save(this.media.create({
      propertyId: id,
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      kind,
      originalName: stored.originalName,
    }));
    return this.mediaView(saved);
  }

  async downloadMedia(userId: string, role: PortalRole | null, id: string) {
    const file = await this.media.findOne({ where: { id } });
    if (!file) throw new NotFoundException('Property media was not found');
    await this.access.assertProperty(userId, role, file.propertyId);
    return this.storage.deliver(file.storageKey, file.mimeType, file.originalName || 'file', file.mimeType.startsWith('image/'));
  }

  private async usableMedia(files: PropertyMedia[]) {
    const live: PropertyMedia[] = [];
    const seen = new Set<string>();
    for (const file of files) {
      const info = await this.storage.stat(file.storageKey);
      if (!info) {
        await this.media.delete({ id: file.id });
        continue;
      }
      const key = `${file.originalName || ''}:${info.size}`;
      if (seen.has(key)) {
        await this.media.delete({ id: file.id });
        await this.storage.remove(file.storageKey);
        continue;
      }
      seen.add(key);
      live.push(file);
    }
    return live;
  }

  private async sameRecentFile(propertyId: string, originalName: string, size: number) {
    const recent = await this.media.find({
      where: { propertyId, originalName },
      order: { createdAt: 'DESC' },
      take: 8,
    });
    const cutoff = Date.now() - 3 * 60 * 1000;
    for (const row of recent) {
      if (new Date(row.createdAt).getTime() < cutoff) continue;
      const info = await this.storage.stat(row.storageKey);
      if (info?.size === size) return row;
    }
    return null;
  }

  private mediaView(file: PropertyMedia) {
    const downloadPath = `properties/media/${file.id}/download`;
    return {
      ...file,
      downloadPath,
      url: this.storage.publicUrl(downloadPath),
    };
  }

  private async withPlaces<T extends { countryId: string; cityId?: string | null }>(items: T[]) {
    const countryIds = [...new Set(items.map((item) => item.countryId))];
    const cityIds = [...new Set(items.map((item) => item.cityId).filter((id): id is string => Boolean(id)))];
    const countries = countryIds.length ? await this.countries.find({ where: { id: In(countryIds) } }) : [];
    const cities = cityIds.length ? await this.cities.find({ where: { id: In(cityIds) } }) : [];
    const countryById = new Map(countries.map((country) => [country.id, { id: country.id, name: country.name }]));
    const cityById = new Map(cities.map((city) => [city.id, { id: city.id, name: city.name }]));
    return items.map((item) => ({
      ...item,
      country: countryById.get(item.countryId) ?? null,
      city: item.cityId ? cityById.get(item.cityId) ?? null : null,
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
