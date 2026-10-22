import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DeviceSession,
  Notification,
  NotificationDelivery,
  NotificationPreference,
} from '../../database/entities';
import { JobsService } from '../jobs/jobs.service';
import { MailService } from './mail.service';
import { buildDedupeKey, shouldCreateNotification } from './notification.rules';
import { IsNull } from 'typeorm';

@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private readonly preferences: Repository<NotificationPreference>,
    @InjectRepository(NotificationDelivery)
    private readonly deliveries: Repository<NotificationDelivery>,
    @InjectRepository(DeviceSession) private readonly devices: Repository<DeviceSession>,
    private readonly jobs: JobsService,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    this.jobs.register('notification.dispatch', async (payload) => {
      await this.dispatch(String(payload.notificationId || ''));
    });
  }

  async notify(input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    data?: Record<string, string>;
    dedupeParts?: Array<string | number>;
    email?: string | null;
  }) {
    const dedupeKey = input.dedupeParts
      ? buildDedupeKey(input.type, input.dedupeParts)
      : null;
    if (dedupeKey) {
      const existing = await this.notifications.findOne({
        where: { userId: input.userId, dedupeKey },
      });
      if (!shouldCreateNotification(Boolean(existing))) return existing;
    }
    try {
      const saved = await this.notifications.save(
        this.notifications.create({
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          data: input.data || null,
          dedupeKey,
        }),
      );
      await this.jobs.enqueue(
        'notification.dispatch',
        { notificationId: saved.id },
        { dedupeKey: `dispatch:${saved.id}` },
      );
      return saved;
    } catch (error) {
      if (dedupeKey && (error?.code === 'ER_DUP_ENTRY' || error?.code === '23505')) {
        return this.notifications.findOne({ where: { userId: input.userId, dedupeKey } });
      }
      throw error;
    }
  }

  async dispatch(notificationId: string) {
    const notification = await this.notifications.findOne({ where: { id: notificationId } });
    if (!notification) return;
    const preference = await this.preferences.findOne({ where: { userId: notification.userId } });
    await this.markChannel(notification.id, 'IN_APP', 'DELIVERED', null);
    if (preference && !preference.emailEnabled) {
      await this.markChannel(notification.id, 'EMAIL', 'SKIPPED', 'disabled');
    } else if (!this.mail.configured()) {
      await this.markChannel(notification.id, 'EMAIL', 'SKIPPED', 'EMAIL_NOT_CONFIGURED');
    }
    const pushToken = await this.devices.findOne({
      where: { userId: notification.userId, revokedAt: IsNull() },
    });
    if (!pushToken?.pushToken || (preference && !preference.pushEnabled)) {
      await this.markChannel(notification.id, 'PUSH', 'SKIPPED', 'PUSH_NOT_CONFIGURED');
    } else {
      await this.markChannel(notification.id, 'PUSH', 'SKIPPED', 'PUSH_PROVIDER_NOT_CONFIGURED');
    }
  }

  async list(userId: string, page: number, pageSize: number) {
    const [items, total] = await this.notifications.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async unreadCount(userId: string) {
    return this.notifications.count({ where: { userId, readAt: IsNull() } });
  }

  async markRead(userId: string, id: string) {
    await this.notifications.update({ id, userId }, { readAt: new Date() });
    return { id, read: true };
  }

  async preferencesFor(userId: string) {
    return this.preferences.findOne({ where: { userId } });
  }

  async getPreferences(userId: string) {
    const existing = await this.preferencesFor(userId);
    if (existing) return existing;
    return {
      userId,
      emailEnabled: true,
      pushEnabled: true,
      smsEnabled: false,
      inAppEnabled: true,
      locale: 'en',
      rentReminderDays: 3,
      billReminderDays: 3,
      autoRemind: true,
    };
  }

  async updatePreferences(userId: string, patch: Partial<NotificationPreference>) {
    const existing = await this.preferences.findOne({ where: { userId } });
    if (!existing) {
      return this.preferences.save(this.preferences.create({ userId, ...patch }));
    }
    Object.assign(existing, patch);
    return this.preferences.save(existing);
  }

  private async markChannel(
    notificationId: string,
    channel: string,
    status: string,
    providerReference: string | null,
  ) {
    const existing = await this.deliveries.findOne({ where: { notificationId, channel } });
    if (existing) return existing;
    try {
      return await this.deliveries.save(
        this.deliveries.create({
          notificationId,
          channel,
          status,
          providerReference,
          attempts: 1,
        }),
      );
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY' || error?.code === '23505') return existing;
      throw error;
    }
  }
}
