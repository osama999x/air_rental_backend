import * as Joi from 'joi';

export default Joi.object({
  NODE_ENV: Joi.string().valid('local', 'development', 'test', 'production', 'staging').default('development'),
  PORT: Joi.number().default(3000),
  API_VERSION: Joi.string().default('1.0.0'),
  APP_PUBLIC_URL: Joi.string().default('http://localhost:3000'),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  BODY_LIMIT: Joi.string().default('10mb'),
  UPLOAD_MAX_MB: Joi.number().default(10),
  STORAGE_DIR: Joi.string().default('storage/private'),
  STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),
  SEED_ON_BOOT: Joi.string().valid('true', 'false').default('true'),
  RUN_JOBS_IN_API: Joi.string().valid('true', 'false').default('true'),
  PROCESS_ROLE: Joi.string().valid('api', 'worker').default('api'),

  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().default('root'),
  DB_PASSWORD: Joi.string().allow('').default(''),
  DB_DATABASE: Joi.string().default('air_rental'),
  DB_SYNCHRONIZE: Joi.string().valid('true', 'false').optional(),
  DB_LOGGING: Joi.string().valid('true', 'false').default('false'),

  JWT_SECRET: Joi.string().default('development-only-access-secret'),
  REFRESH_KEY: Joi.string().default('development-only-refresh-secret'),
  ACCESS_TOKEN_EXPIRES_IN: Joi.number().default(900),
  REFRESH_KEY_EXPIRES_IN: Joi.number().default(2592000),

  GOOGLE_CLIENT_ID: Joi.string().allow('').optional(),
  APPLE_CLIENT_ID: Joi.string().allow('').optional(),

  MAIL_HOST: Joi.string().allow('').default('smtp.gmail.com'),
  MAIL_PORT: Joi.number().default(465),
  MAIL_ADDRESS: Joi.string().allow('').optional(),
  MAIL_PASSWORD: Joi.string().allow('').optional(),

  S3_BUCKET: Joi.string().allow('').optional(),
  S3_REGION: Joi.string().allow('').optional(),
  S3_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  S3_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
  S3_ENDPOINT: Joi.string().allow('').optional(),

  PAYMENT_PROVIDER: Joi.string().allow('').default('sandbox'),
  PAYMENT_WEBHOOK_SECRET: Joi.string().allow('').optional(),

  AI_PROVIDER: Joi.string().allow('').default(''),
  AI_BASE_URL: Joi.string().allow('').optional(),
  AI_API_KEY: Joi.string().allow('').optional(),

  FCM_SERVER_KEY: Joi.string().allow('').optional(),
  SMS_PROVIDER: Joi.string().allow('').optional(),
  SMS_API_KEY: Joi.string().allow('').optional(),

  ADMIN_EMAIL: Joi.string().allow('').optional(),
  ADMIN_PASSWORD: Joi.string().allow('').optional(),
  ADMIN_NAME: Joi.string().allow('').default('Platform Admin'),

  SWAGGER_USER: Joi.string().default('dev'),
  SWAGGER_PASSWORD: Joi.string().default('change-me'),
});
