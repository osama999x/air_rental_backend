import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MembershipStatus, OrganizationMemberRole } from '../../common/enums';
import { Organization, OrganizationMember, User } from '../../database/entities';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    @InjectRepository(OrganizationMember) private readonly members: Repository<OrganizationMember>,
    private readonly audit: AuditService,
  ) {}

  async create(user: User, input: Partial<Organization>) {
    const organization = await this.organizations.save(this.organizations.create({
      ...input,
      createdByUserId: user.id,
    }));
    await this.members.save(this.members.create({
      organizationId: organization.id,
      userId: user.id,
      memberRole: OrganizationMemberRole.OWNER,
      status: MembershipStatus.ACTIVE,
    }));
    await this.audit.record({
      actorUserId: user.id,
      actorType: 'USER',
      action: 'organization.created',
      entityType: 'organization',
      entityId: organization.id,
    });
    return organization;
  }

  async list(userId: string) {
    const memberships = await this.members.find({ where: { userId, status: MembershipStatus.ACTIVE } });
    if (!memberships.length) return [];
    return this.organizations.find({
      where: { id: In(memberships.map((member) => member.organizationId)) },
    });
  }

  async get(userId: string, id: string) {
    await this.assertMember(userId, id);
    const organization = await this.organizations.findOne({ where: { id } });
    const members = await this.members.find({ where: { organizationId: id, status: MembershipStatus.ACTIVE } });
    return { ...organization, members };
  }

  async addMember(actorId: string, organizationId: string, userId: string, memberRole: OrganizationMemberRole) {
    await this.assertAdmin(actorId, organizationId);
    const existing = await this.members.findOne({ where: { organizationId, userId } });
    if (existing) {
      existing.memberRole = memberRole;
      existing.status = MembershipStatus.ACTIVE;
      return this.members.save(existing);
    }
    return this.members.save(this.members.create({
      organizationId,
      userId,
      memberRole,
      status: MembershipStatus.ACTIVE,
    }));
  }

  private async assertMember(userId: string, organizationId: string) {
    const member = await this.members.findOne({
      where: { userId, organizationId, status: MembershipStatus.ACTIVE },
    });
    if (!member) throw new NotFoundException('Organization was not found');
    return member;
  }

  private async assertAdmin(userId: string, organizationId: string) {
    const member = await this.assertMember(userId, organizationId);
    if (![OrganizationMemberRole.OWNER, OrganizationMemberRole.ADMIN].includes(member.memberRole)) {
      throw new ForbiddenException('Organization admin access is required');
    }
  }
}
