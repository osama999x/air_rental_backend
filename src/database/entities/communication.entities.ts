import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity, CreatedEntity } from './base.entity';

@Entity('chat_threads')
export class ChatThread extends CreatedEntity {
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  tenancyId: string;
}

@Entity('chat_participants')
@Unique('uq_chat_participant', ['threadId', 'userId'])
export class ChatParticipant extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  threadId: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16 })
  side: string;

  @Column({ type: 'timestamptz', nullable: true })
  leftAt?: Date | null;
}

@Entity('chat_messages')
export class ChatMessage extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  threadId: string;

  @Column({ type: 'uuid' })
  senderUserId: string;

  @Column({ type: 'text', nullable: true })
  body?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  editedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}

@Entity('chat_attachments')
export class ChatAttachment extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  messageId: string;

  @Column({ type: 'varchar', length: 255 })
  storageKey: string;

  @Column({ type: 'varchar', length: 120 })
  mimeType: string;

  @Column({ type: 'varchar', length: 180, nullable: true })
  originalName?: string | null;
}

@Entity('message_read_receipts')
@Unique('uq_message_read', ['messageId', 'userId'])
export class MessageReadReceipt extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  messageId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'timestamptz' })
  readAt: Date;
}

@Entity('notifications')
@Unique('uq_notification_dedupe', ['userId', 'dedupeKey'])
export class Notification extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  type: string;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'simple-json', nullable: true })
  data?: Record<string, string> | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  dedupeKey?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  readAt?: Date | null;
}

@Entity('notification_preferences')
export class NotificationPreference extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ default: true })
  emailEnabled: boolean;

  @Column({ default: true })
  pushEnabled: boolean;

  @Column({ default: false })
  smsEnabled: boolean;

  @Column({ default: true })
  inAppEnabled: boolean;

  @Column({ type: 'varchar', length: 12, default: 'en' })
  locale: string;

  @Column({ type: 'int', default: 3 })
  rentReminderDays: number;

  @Column({ type: 'int', default: 3 })
  billReminderDays: number;

  @Column({ default: true })
  autoRemind: boolean;
}

@Entity('notification_deliveries')
@Unique('uq_delivery_channel', ['notificationId', 'channel'])
export class NotificationDelivery extends CreatedEntity {
  @Index()
  @Column({ type: 'uuid' })
  notificationId: string;

  @Column({ type: 'varchar', length: 16 })
  channel: string;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  providerReference?: string | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastError?: string | null;
}
