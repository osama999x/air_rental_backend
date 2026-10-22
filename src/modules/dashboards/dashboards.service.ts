import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { PortalRole, PropertyStatus, RentStatus, TenancyStatus } from '../../common/enums';
import { MaintenanceRequest, Property, RentObligation, Tenancy } from '../../database/entities';
import { AccessService } from '../access/access.service';
import { ChatService } from '../chat/chat.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DashboardsService {
  constructor(
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(Tenancy) private readonly tenancies: Repository<Tenancy>,
    @InjectRepository(RentObligation) private readonly rent: Repository<RentObligation>,
    @InjectRepository(MaintenanceRequest) private readonly maintenance: Repository<MaintenanceRequest>,
    private readonly access: AccessService,
    private readonly chat: ChatService,
    private readonly notifications: NotificationsService,
  ) {}

  async owner(userId: string) {
    const actor = await this.access.actor(userId, PortalRole.OWNER);
    const ids = actor.ownedPropertyIds;
    if (!ids.length) return this.emptyOwner();
    const [rented, vacant, activeTenancies, overdueRent, proofs, maintenance] = await Promise.all([
      this.properties.count({ where: { id: In(ids), status: PropertyStatus.RENTED, archivedAt: IsNull() } }),
      this.properties.count({ where: { id: In(ids), status: PropertyStatus.VACANT, archivedAt: IsNull() } }),
      this.tenancies.count({ where: { propertyId: In(ids), status: TenancyStatus.ACTIVE } }),
      this.rent.count({ where: { propertyId: In(ids), status: RentStatus.OVERDUE } }),
      this.rent.count({ where: { propertyId: In(ids), status: In([RentStatus.PROOF_SUBMITTED, RentStatus.UNDER_REVIEW]) } }),
      this.maintenance.count({ where: { propertyId: In(ids), status: In(['NEW', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS'] as any) } }),
    ]);
    return {
      properties: ids.length,
      rented,
      vacant,
      activeTenancies,
      overdueRent,
      pendingProofs: proofs,
      openMaintenance: maintenance,
    };
  }

  async tenant(userId: string) {
    const actor = await this.access.actor(userId, PortalRole.TENANT);
    return {
      rentedProperties: actor.tenantPropertyIds.length,
      tenancies: actor.tenantTenancyIds.length,
      unreadMessages: await this.chat.unread(userId),
      unreadNotifications: await this.notifications.unreadCount(userId),
    };
  }

  async manager(userId: string) {
    const actor = await this.access.actor(userId, PortalRole.MANAGER);
    const propertyIds = actor.assignments.filter((item) => item.status === 'ACTIVE').flatMap((item) => item.propertyIds);
    return {
      assignedProperties: new Set(propertyIds).size,
      activeAssignments: actor.assignments.filter((item) => item.status === 'ACTIVE').length,
      unreadNotifications: await this.notifications.unreadCount(userId),
    };
  }

  private emptyOwner() {
    return { properties: 0, rented: 0, vacant: 0, activeTenancies: 0, overdueRent: 0, pendingProofs: 0, openMaintenance: 0 };
  }
}
