import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import rateLimit from 'express-rate-limit';
import {
  API_PREFIX,
  BODY_LIMIT,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
} from './constants';

export function configureApp(
  app: INestApplication,
  config: ConfigService,
): void {
  const logger = new Logger('Http');

  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  const configuredOrigins = (config.get<string>('CORS_ORIGINS') || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const devOrigins = ['http://localhost:3000', 'http://localhost:4200', 'http://localhost:5000', 'http://localhost:8080'];
  app.enableCors({
    origin: configuredOrigins.length
      ? configuredOrigins
      : config.get('NODE_ENV') === 'production'
        ? false
        : devOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Portal-Role', 'X-Request-Id', 'Idempotency-Key'],
  });
  app.use((req, res, next) => {
    const request = req as typeof req & { id?: string };
    const incoming = request.headers['x-request-id'];
    request.id = typeof incoming === 'string' && incoming ? incoming : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    res.setHeader('X-Request-Id', request.id);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.use(
    rateLimit({
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        logger.warn(`Rate limit exceeded for ${req.ip}`);
        res.status(429).json({
          message: 'Too many requests. Try again in 2 minutes.',
        });
      },
    }),
  );

  app.use(json({ limit: config.get<string>('BODY_LIMIT') || BODY_LIMIT }));
  app.use(
    urlencoded({
      limit: config.get<string>('BODY_LIMIT') || BODY_LIMIT,
      extended: true,
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
}
