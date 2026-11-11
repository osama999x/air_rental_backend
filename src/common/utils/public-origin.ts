const PUBLIC_API = 'https://api.airrental1.com';
const RAW_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '179.236.65.153']);

export function apiPublicOrigin(configured: string | undefined, _port = 3009): string {
  const value = String(configured || '').trim().replace(/\/+$/, '').replace(/\.+$/, '');
  if (!value) return PUBLIC_API;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return PUBLIC_API;
  }
  const host = url.hostname.replace(/\.+$/, '').toLowerCase();
  if (RAW_HOSTS.has(host)) return PUBLIC_API;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return PUBLIC_API;
  if (url.protocol === 'http:' && host === 'api.airrental1.com') {
    return PUBLIC_API;
  }
  return url.origin;
}
