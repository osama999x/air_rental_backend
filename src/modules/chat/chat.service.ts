import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  ChatAttachment,
  ChatMessage,
  ChatParticipant,
  ChatThread,
  MessageReadReceipt,
} from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { canAccessThread } from '../access/access.policy';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatThread) private readonly threads: Repository<ChatThread>,
    @InjectRepository(ChatParticipant) private readonly participants: Repository<ChatParticipant>,
    @InjectRepository(ChatMessage) private readonly messages: Repository<ChatMessage>,
    @InjectRepository(ChatAttachment) private readonly attachments: Repository<ChatAttachment>,
    @InjectRepository(MessageReadReceipt) private readonly receipts: Repository<MessageReadReceipt>,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async assertMember(userId: string, threadId: string) {
    const members = await this.participants.find({ where: { threadId, leftAt: IsNull() } });
    if (!canAccessThread(members.map((member) => member.userId), userId)) {
      throw new ForbiddenException('You are not a participant in this chat');
    }
    return members;
  }

  async threadForTenancy(userId: string, tenancyId: string) {
    const thread = await this.threads.findOne({ where: { tenancyId } });
    if (!thread) throw new NotFoundException('Chat thread was not found');
    await this.assertMember(userId, thread.id);
    return thread;
  }

  async listMessages(userId: string, threadId: string, page = 1, pageSize = 30) {
    await this.assertMember(userId, threadId);
    const [items, total] = await this.messages.findAndCount({
      where: { threadId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total, page, pageSize };
  }

  async send(userId: string, threadId: string, body?: string, file?: Express.Multer.File, data?: string, fileName?: string) {
    const members = await this.assertMember(userId, threadId);
    if (!body && !file && !data) throw new ForbiddenException('A message or attachment is required');
    const message = await this.messages.save(this.messages.create({ threadId, senderUserId: userId, body }));
    if (file || data) {
      const stored = await this.storage.keep({ file, data, fileName, required: false });
      if (stored) {
        await this.attachments.save(this.attachments.create({
          messageId: message.id,
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          originalName: stored.originalName,
        }));
      }
    }
    for (const member of members.filter((item) => item.userId !== userId)) {
      await this.notifications.notify({
        userId: member.userId,
        type: 'chat.message',
        title: 'New tenancy message',
        body: body || 'A new attachment was shared.',
        dedupeParts: ['message', message.id, member.userId],
      });
    }
    return message;
  }

  async markRead(userId: string, messageId: string) {
    const message = await this.messages.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message was not found');
    await this.assertMember(userId, message.threadId);
    const existing = await this.receipts.findOne({ where: { messageId, userId } });
    if (existing) return existing;
    return this.receipts.save(this.receipts.create({ messageId, userId, readAt: new Date() }));
  }

  async edit(userId: string, messageId: string, body: string) {
    const message = await this.messages.findOne({ where: { id: messageId } });
    if (!message || message.senderUserId !== userId) throw new ForbiddenException('You cannot edit this message');
    if (Date.now() - message.createdAt.getTime() > 15 * 60 * 1000) {
      throw new ForbiddenException('Messages can only be edited for 15 minutes');
    }
    message.body = body;
    message.editedAt = new Date();
    await this.audit.record({
      actorUserId: userId,
      actorType: 'USER',
      action: 'chat.edited',
      entityType: 'chat_message',
      entityId: messageId,
    });
    return this.messages.save(message);
  }

  async remove(userId: string, messageId: string) {
    const message = await this.messages.findOne({ where: { id: messageId } });
    if (!message || message.senderUserId !== userId) throw new ForbiddenException('You cannot delete this message');
    message.deletedAt = new Date();
    message.body = null;
    return this.messages.save(message);
  }

  async unread(userId: string) {
    const memberships = await this.participants.find({ where: { userId, leftAt: IsNull() } });
    let count = 0;
    for (const membership of memberships) {
      const messages = await this.messages.find({ where: { threadId: membership.threadId } });
      for (const message of messages) {
        if (message.senderUserId === userId || message.deletedAt) continue;
        const receipt = await this.receipts.findOne({ where: { messageId: message.id, userId } });
        if (!receipt) count += 1;
      }
    }
    return count;
  }
}
