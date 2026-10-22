import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountCategory } from '../../common/enums';
import { OwnerProfile, TenantProfile, User } from '../../database/entities';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(OwnerProfile) private readonly owners: Repository<OwnerProfile>,
    @InjectRepository(TenantProfile) private readonly tenants: Repository<TenantProfile>,
    private readonly auth: AuthService,
  ) {}

  async me(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    const roles = await this.auth.listRoles(userId);
    const ownerProfile = await this.owners.findOne({ where: { userId } });
    const tenantProfile = await this.tenants.findOne({ where: { userId } });
    return { user, ...roles, ownerProfile, tenantProfile };
  }

  async update(userId: string, patch: Partial<User>) {
    await this.users.update({ id: userId }, {
      firstName: patch.firstName,
      lastName: patch.lastName,
      phone: patch.phone,
      preferredLanguage: patch.preferredLanguage,
      timezone: patch.timezone,
    });
    return this.users.findOne({ where: { id: userId } });
  }

  async updateOwner(user: User, patch: { category?: AccountCategory; organizationId?: string; displayName?: string }) {
    const profile = await this.owners.findOne({ where: { userId: user.id } });
    if (!profile) throw new BadRequestException('Add the owner role before editing an owner profile');
    if (patch.category === AccountCategory.BUSINESS && !patch.organizationId && !profile.organizationId) {
      throw new BadRequestException('A business owner profile requires an organization');
    }
    Object.assign(profile, patch);
    return this.owners.save(profile);
  }

  async updateTenant(user: User, patch: Partial<TenantProfile>) {
    const profile = await this.tenants.findOne({ where: { userId: user.id } });
    if (!profile) throw new BadRequestException('Add the tenant role before editing a tenant profile');
    Object.assign(profile, patch);
    return this.tenants.save(profile);
  }
}
