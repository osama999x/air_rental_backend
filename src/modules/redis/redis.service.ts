import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Store } from 'express-rate-limit';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private memoryHits = new Map<string, { hits: number; resetAt: number }>();

  constructor(private readonly config: ConfigService) {
    const password = String(this.config.get('REDIS_PASSWORD') || '');
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST') || 'localhost',
      port: Number(this.config.get('REDIS_PORT')) || 6379,
      password: password || undefined,
      db: Number(this.config.get('REDIS_DATABASE')) || 0,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
    this.client.on('error', (error: Error) => {
      this.logger.error(error.message);
    });
  }

  async onModuleInit() {
    try {
      await this.client.ping();
      this.logger.log('Redis connected');
    } catch {
      this.logger.error('Redis is not reachable. Rate limits and reference data will use this process until it reconnects.');
    }
  }

  async onModuleDestroy() {
    this.client.disconnect();
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  status() {
    return {
      connected: this.client.status === 'ready',
      host: this.config.get<string>('REDIS_HOST') || 'localhost',
      port: Number(this.config.get('REDIS_PORT')) || 6379,
      database: Number(this.config.get('REDIS_DATABASE')) || 0,
    };
  }

  async remember<T>(key: string, seconds: number, load: () => Promise<T>): Promise<T> {
    const redisKey = `air-rental:${key}`;
    try {
      const hit = await this.client.get(redisKey);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      return load();
    }
    const value = await load();
    try {
      await this.client.set(redisKey, JSON.stringify(value), 'EX', seconds);
    } catch {
      return value;
    }
    return value;
  }

  rateLimitStore(): Store {
    let windowMs = 2 * 60 * 1000;
    return {
      init: (options) => {
        windowMs = options.windowMs;
      },
      increment: async (key: string) => {
        const redisKey = `air-rental:rate:${key}`;
        try {
          const hits = await this.client.incr(redisKey);
          let ttl = await this.client.pttl(redisKey);
          if (hits === 1 || ttl < 0) {
            await this.client.pexpire(redisKey, windowMs);
            ttl = windowMs;
          }
          return { totalHits: hits, resetTime: new Date(Date.now() + ttl) };
        } catch {
          return this.memoryIncrement(redisKey, windowMs);
        }
      },
      decrement: async (key: string) => {
        try {
          await this.client.decr(`air-rental:rate:${key}`);
        } catch {
          const row = this.memoryHits.get(`air-rental:rate:${key}`);
          if (row) row.hits = Math.max(0, row.hits - 1);
        }
      },
      resetKey: async (key: string) => {
        const redisKey = `air-rental:rate:${key}`;
        this.memoryHits.delete(redisKey);
        try {
          await this.client.del(redisKey);
        } catch {
          return;
        }
      },
    };
  }

  private memoryIncrement(key: string, windowMs: number) {
    const now = Date.now();
    const current = this.memoryHits.get(key);
    if (!current || current.resetAt <= now) {
      const resetAt = now + windowMs;
      this.memoryHits.set(key, { hits: 1, resetAt });
      return { totalHits: 1, resetTime: new Date(resetAt) };
    }
    current.hits += 1;
    return { totalHits: current.hits, resetTime: new Date(current.resetAt) };
  }
}
