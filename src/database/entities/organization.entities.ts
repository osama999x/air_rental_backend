import { Column, Entity, Index, Unique } from 'typeorm';
import {
  AccountCategory,
  MembershipStatus,
  OrganizationMemberRole,
} from '../../common/enums';
import { BaseEntity, CreatedEntity } from './base.entity';

@Entity('organizations')
export class Organization extends BaseEntity {
  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  organizationType?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  logoStorageKey?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  addressLine?: string | null;

  @Column({ type: 'uuid', nullable: true })
  cityId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  countryId?: string | null;

  @Index()
  @Column({ type: 'uuid' })
  createdByUserId: string;
}

@Entity('organization_members')
@Unique('uq_org_member', ['organizationId', 'userId'])
export class OrganizationMember extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  organizationId: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16 })
  memberRole: OrganizationMemberRole;

  @Column({ type: 'varchar', length: 16, default: MembershipStatus.ACTIVE })
  status: MembershipStatus;
}

@Entity('owner_profiles')
export class OwnerProfile extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16, default: AccountCategory.INDIVIDUAL })
  category: AccountCategory;

  @Column({ type: 'uuid', nullable: true })
  organizationId?: string | null;

  @Column({ type: 'varchar', length: 180 })
  displayName: string;
}

@Entity('tenant_profiles')
export class TenantProfile extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16, default: AccountCategory.INDIVIDUAL })
  category: AccountCategory;

  @Column({ type: 'uuid', nullable: true })
  organizationId?: string | null;

  @Column({ type: 'varchar', length: 180 })
  displayName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  currentAddress?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  emergencyContactName?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  emergencyContactPhone?: string | null;
}

@Entity('manager_profiles')
export class ManagerProfile extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 180 })
  displayName: string;
}
