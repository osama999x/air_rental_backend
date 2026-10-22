import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  type: 'postgres' as const,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'air_rental',
  synchronize:
    process.env.DB_SYNCHRONIZE ||
    (process.env.NODE_ENV === 'production' ? 'false' : 'true'),
  logging: process.env.DB_LOGGING || 'false',
}));
