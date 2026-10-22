import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { MediaKind, PropertyStatus, PropertyType } from '../../common/enums';
import { BaseEntity, CreatedEntity } from './base.entity';

@Entity('properties')
export class Property extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  visibleCode: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Index()
  @Column({ type: 'varchar', length: 8 })
  propertyType: PropertyType;

  @Index()
  @Column({ type: 'uuid' })
  countryId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  cityId?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  region?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  area?: string | null;

  @Column({ type: 'varchar', length: 255 })
  addressLine: string;

  @Column({ type: 'varchar', length: 24, nullable: true })
  postalCode?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude?: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  sizeValue?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  measurementUnitCode?: string | null;

  @Index()
  @Column({ type: 'varchar', length: 16, default: PropertyStatus.VACANT })
  status: PropertyStatus;

  @Column({ type: 'simple-json', nullable: true })
  facilities?: string[] | null;

  @Index()
  @Column({ type: 'uuid' })
  ownerUserId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  organizationId?: string | null;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone: string;

  @Column({ type: 'varchar', length: 3 })
  currencyCode: string;

  @Column({ default: false })
  tenantInsuranceRequired: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt?: Date | null;
}

@Entity('property_code_sequences')
export class PropertyCodeSequence {
  @PrimaryColumn({ type: 'varchar', length: 8 })
  propertyType: PropertyType;

  @Column({ type: 'int', default: 0 })
  lastNumber: number;
}

@Entity('property_ownership_history')
export class PropertyOwnershipHistory extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  propertyId: string;

  @Index()
  @Column({ type: 'uuid' })
  ownerUserId: string;

  @Column({ type: 'uuid', nullable: true })
  organizationId?: string | null;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt?: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason?: string | null;
}

@Entity('property_media')
export class PropertyMedia extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  propertyId: string;

  @Column({ type: 'varchar', length: 255 })
  storageKey: string;

  @Column({ type: 'varchar', length: 120 })
  mimeType: string;

  @Column({ type: 'varchar', length: 16 })
  kind: MediaKind;

  @Column({ type: 'varchar', length: 180, nullable: true })
  originalName?: string | null;
}
