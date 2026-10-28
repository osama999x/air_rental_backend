import { registerAs } from '@nestjs/config';
import { apiPublicOrigin } from '../common/utils/public-origin';

export default registerAs('appConfig', () => ({
  environment: process.env.NODE_ENV || 'development',
  apiVersion: process.env.API_VERSION || '1.0.0',
  publicUrl: apiPublicOrigin(process.env.APP_PUBLIC_URL, Number(process.env.PORT) || 3009),
}));
