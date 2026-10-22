import { registerAs } from '@nestjs/config';

export default registerAs('appConfig', () => ({
  environment: process.env.NODE_ENV || 'development',
  apiVersion: process.env.API_VERSION || '1.0.0',
  publicUrl: process.env.APP_PUBLIC_URL || 'http://localhost:3000',
}));
