import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountCategory, PortalRole } from '../../common/enums';
import { ManagerProfile, OwnerProfile, TenantProfile, User } from '../../database/entities';
import { AuthService } from '../auth/auth.service';
import { StorageService } from '../storage/storage.service';

type ProfileEdit = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  preferredLanguage?: string;
  timezone?: string;
  category?: AccountCategory;
  organizationId?: string;
  displayName?: string;
  currentAddress?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  data?: string;
  fileName?: string;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(OwnerProfile) private readonly owners: Repository<OwnerProfile>,
    @InjectRepository(TenantProfile) private readonly tenants: Repository<TenantProfile>,
    @InjectRepository(ManagerProfile) private readonly managers: Repository<ManagerProfile>,
    private readonly auth: AuthService,
    private readonly storage: StorageService,
  ) {}

  async me(userId: string) {
    const user = await this.requireUser(userId);
    const roles = await this.auth.listRoles(userId);
    const ownerProfile = await this.owners.findOne({ where: { userId } });
    const tenantProfile = await this.tenants.findOne({ where: { userId } });
    const managerProfile = await this.managers.findOne({ where: { userId } });
    return {
      user: this.presentUser(user),
      ...roles,
      ownerProfile,
      tenantProfile,
      managerProfile,
    };
  }

  async edit(userId: string, role: PortalRole | null, patch: ProfileEdit, file?: Express.Multer.File) {
    const user = await this.requireUser(userId);
    const account = defined({
      firstName: patch.firstName,
      lastName: patch.lastName,
      phone: patch.phone,
      preferredLanguage: patch.preferredLanguage,
      timezone: patch.timezone,
    });
    if (Object.keys(account).length) await this.users.update({ id: userId }, account);
    if (file || patch.data?.trim()) await this.replaceAvatar(user, file, patch.data, patch.fileName);
    await this.editRoleProfile(user, role, patch);
    return this.me(userId);
  }

  async avatar(userId: string) {
    const user = await this.requireUser(userId);
    if (!user.avatarStorageKey) throw new NotFoundException('Profile photo was not found');
    return this.storage.deliver(user.avatarStorageKey, user.avatarMimeType || 'image/jpeg', 'profile', true);
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

  private async requireUser(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Profile was not found');
    return user;
  }

  private presentUser(user: User) {
    const downloadPath = 'users/me/avatar';
    return {
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      phone: user.phone,
      phoneVerifiedAt: user.phoneVerifiedAt,
      firstName: user.firstName,
      lastName: user.lastName,
      preferredLanguage: user.preferredLanguage,
      timezone: user.timezone,
      status: user.status,
      deletionRequestedAt: user.deletionRequestedAt,
      mfaEnabled: user.mfaEnabled,
      preferredPortalRole: user.preferredPortalRole,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      avatar: user.avatarStorageKey
        ? {
            downloadPath,
            url: this.storage.publicUrl(downloadPath),
            mimeType: user.avatarMimeType,
          }
        : null,
    };
  }

  private async replaceAvatar(user: User, file: Express.Multer.File | undefined, data?: string, fileName?: string) {
    const stored = await this.storage.keep({ file, data, fileName });
    if (!stored) throw new BadRequestException('Choose a profile photo');
    if (!stored.mimeType.startsWith('image/')) {
      await this.storage.remove(stored.storageKey);
      throw new BadRequestException('Profile photo must be an image');
    }
    const previous = user.avatarStorageKey;
    await this.users.update({ id: user.id }, {
      avatarStorageKey: stored.storageKey,
      avatarMimeType: stored.mimeType,
    });
    if (previous && previous !== stored.storageKey) await this.storage.remove(previous);
  }

  private async editRoleProfile(user: User, role: PortalRole | null, patch: ProfileEdit) {
    if (role === PortalRole.OWNER) {
      const next = defined({
        category: patch.category,
        organizationId: patch.organizationId,
        displayName: patch.displayName,
      });
      if (!Object.keys(next).length) return;
      await this.updateOwner(user, next);
      return;
    }
    if (role === PortalRole.TENANT) {
      const next = defined({
        category: patch.category,
        organizationId: patch.organizationId,
        displayName: patch.displayName,
        currentAddress: patch.currentAddress,
        emergencyContactName: patch.emergencyContactName,
        emergencyContactPhone: patch.emergencyContactPhone,
      });
      if (!Object.keys(next).length) return;
      await this.updateTenant(user, next);
      return;
    }
    if (role === PortalRole.MANAGER && patch.displayName !== undefined) {
      const profile = await this.managers.findOne({ where: { userId: user.id } });
      if (!profile) throw new BadRequestException('Add the manager role before editing a manager profile');
      profile.displayName = patch.displayName;
      await this.managers.save(profile);
    }
  }
}

function defined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}
