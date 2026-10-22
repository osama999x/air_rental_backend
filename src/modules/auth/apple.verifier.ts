import { createPublicKey, createVerify } from 'crypto';

interface AppleIdentity {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
}

export async function verifyAppleIdentityToken(
  identityToken: string,
  clientId: string,
): Promise<AppleIdentity> {
  const [headerPart, payloadPart, signaturePart] = identityToken.split('.');
  if (!headerPart || !payloadPart || !signaturePart) {
    throw new Error('Malformed Apple identity token');
  }
  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  if (payload.iss !== 'https://appleid.apple.com') throw new Error('Invalid Apple issuer');
  if (payload.aud !== clientId) throw new Error('Invalid Apple audience');
  if (payload.exp * 1000 < Date.now()) throw new Error('Apple token expired');
  const response = await fetch('https://appleid.apple.com/auth/keys');
  if (!response.ok) throw new Error('Unable to load Apple signing keys');
  const { keys } = (await response.json()) as { keys: Array<{ kid: string }> };
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error('Apple signing key was not found');
  const key = createPublicKey({ key: jwk as any, format: 'jwk' });
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerPart}.${payloadPart}`);
  const valid = verifier.verify(key, Buffer.from(signaturePart, 'base64url'));
  if (!valid) throw new Error('Apple token signature is invalid');
  return payload;
}
