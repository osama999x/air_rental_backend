const PLACEHOLDER = 'http://localhost:3000';
const SERVER_HOST = '179.236.65.153';

export function apiPublicOrigin(configured: string | undefined, port = 3009): string {
  const value = String(configured || '').trim().replace(/\/$/, '');
  if (!value || value === PLACEHOLDER) {
    const safePort = Number(port) || 3009;
    return `http://${SERVER_HOST}:${safePort}`;
  }
  return value;
}
