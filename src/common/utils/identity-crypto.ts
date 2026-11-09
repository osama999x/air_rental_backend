import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const keys = new Map<string, Buffer>();

function keyFor(secret: string) {
  const cached = keys.get(secret);
  if (cached) return cached;
  const key = scryptSync(secret, 'air-rental-identity', 32);
  keys.set(secret, key);
  return key;
}

export function sealBytes(plain: Buffer, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return {
    cipher: encrypted,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function openBytes(cipher: Buffer, iv: string, tag: string, secret: string) {
  const decipher = createDecipheriv('aes-256-gcm', keyFor(secret), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(cipher), decipher.final()]);
}

export function sealText(plain: string, secret: string) {
  const sealed = sealBytes(Buffer.from(plain, 'utf8'), secret);
  return {
    cipher: sealed.cipher.toString('base64'),
    iv: sealed.iv,
    tag: sealed.tag,
  };
}

export function openText(cipher: string, iv: string, tag: string, secret: string) {
  return openBytes(Buffer.from(cipher, 'base64'), iv, tag, secret).toString('utf8');
}
