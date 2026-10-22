import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { ScheduledJob } from '../../database/entities';
import { JobStatus } from '../../common/enums';
import { addDays } from '../../common/utils/dates.util';

export type JobHandler = (
  payload: Record<string, string | number | boolean | null>,
) => Promise<void>;

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectRepository(ScheduledJob) private readonly jobs: Repository<ScheduledJob>,
  ) {}

  register(type: string, handler: JobHandler) {
    this.handlers.set(type, handler);
  }

  async enqueue(
    type: string,
    payload: Record<string, string | number | boolean | null>,
    options?: { runAt?: Date; dedupeKey?: string; maxAttempts?: number },
  ): Promise<ScheduledJob | null> {
    try {
      return await this.jobs.save(
        this.jobs.create({
          type,
          payload,
          runAt: options?.runAt || new Date(),
          status: JobStatus.PENDING,
          dedupeKey: options?.dedupeKey,
          maxAttempts: options?.maxAttempts ?? 5,
          attempts: 0,
        }),
      );
    } catch (error) {
      if (options?.dedupeKey && this.isDuplicate(error)) return null;
      throw error;
    }
  }

  startLoop() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((error) => this.logger.error(error?.message || error));
    }, 5000);
    this.tick().catch((error) => this.logger.error(error?.message || error));
  }

  stopLoop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.jobs.find({
        where: { status: JobStatus.PENDING, runAt: LessThanOrEqual(new Date()), lockedAt: IsNull() },
        order: { runAt: 'ASC' },
        take: 20,
      });
      for (const job of due) {
        await this.processOne(job.id);
      }
    } finally {
      this.running = false;
    }
  }

  private async processOne(id: string) {
    const claimed = await this.jobs.update(
      { id, status: JobStatus.PENDING },
      { status: JobStatus.PROCESSING, lockedAt: new Date() },
    );
    if (!claimed.affected) return;
    const job = await this.jobs.findOne({ where: { id } });
    if (!job) return;
    const handler = this.handlers.get(job.type);
    try {
      if (!handler) throw new Error(`No handler registered for ${job.type}`);
      await handler(job.payload || {});
      await this.jobs.update({ id }, { status: JobStatus.SUCCEEDED, lastError: null });
    } catch (error) {
      const attempts = job.attempts + 1;
      const dead = attempts >= job.maxAttempts;
      const delayMinutes = Math.min(60, 2 ** attempts);
      await this.jobs.update(
        { id },
        {
          attempts,
          status: dead ? JobStatus.DEAD : JobStatus.PENDING,
          lastError: String(error?.message || error).slice(0, 250),
          lockedAt: null,
          runAt: dead ? job.runAt : new Date(Date.now() + delayMinutes * 60 * 1000),
        },
      );
    }
  }

  async counts() {
    const dead = await this.jobs.count({ where: { status: JobStatus.DEAD } });
    const pending = await this.jobs.count({ where: { status: JobStatus.PENDING } });
    return { dead, pending };
  }

  nextDay(from = new Date()): Date {
    return addDays(from, 1);
  }

  private isDuplicate(error: any): boolean {
    return error?.code === 'ER_DUP_ENTRY' || error?.code === '23505';
  }
}
