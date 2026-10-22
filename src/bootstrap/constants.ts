export const API_PREFIX = 'api/v1';
export const BODY_LIMIT = '10mb';
export const RATE_LIMIT_WINDOW_MS = 2 * 60 * 1000;
export const RATE_LIMIT_MAX = 100;
export const SWAGGER_PATH = 'api-docs';

export const SWAGGER_ENVIRONMENTS = [
  'local',
  'development',
  'staging',
] as const;

export function isSwaggerEnabled(environment?: string): boolean {
  return SWAGGER_ENVIRONMENTS.includes(
    environment as (typeof SWAGGER_ENVIRONMENTS)[number],
  );
}
