import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from './entities';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'air_rental',
  entities: ALL_ENTITIES,
  migrations: ['src/database/migrations/*.ts'],
});
