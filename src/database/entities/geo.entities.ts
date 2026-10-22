import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('countries')
export class Country extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 2 })
  iso2: string;

  @Column({ type: 'varchar', length: 3 })
  iso3: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 8, nullable: true })
  phoneCode?: string | null;

  @Column({ type: 'varchar', length: 3 })
  defaultCurrencyCode: string;

  @Column({ type: 'varchar', length: 64 })
  defaultTimezone: string;
}

@Entity('cities')
@Unique('uq_city_country_name_region', ['countryId', 'name', 'region'])
export class City extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  countryId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  region: string;
}

@Entity('languages')
export class Language extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 12 })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 80 })
  nativeName: string;
}

@Entity('currencies')
export class Currency {
  @PrimaryColumn({ type: 'varchar', length: 3 })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'int' })
  minorUnits: number;
}

@Entity('measurement_units')
export class MeasurementUnit extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 16 })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 32 })
  system: string;
}
