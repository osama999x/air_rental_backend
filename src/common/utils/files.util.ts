const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/webm',
  'video/mp4',
  'video/webm',
]);

export function assertAllowedUpload(mimeType: string, size: number, maxBytes: number) {
  if (!ALLOWED.has(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
  if (size <= 0 || size > maxBytes) {
    throw new Error('File size is outside the allowed limit');
  }
}

export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}
