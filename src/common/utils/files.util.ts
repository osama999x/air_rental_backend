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

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'audio/webm': '.weba',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  weba: 'audio/webm',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export function safeFileName(name: string): string {
  return storedFileName(name);
}

export function storedFileName(name: string | undefined, mimeType?: string): string {
  const base = String(name || '').split(/[/\\]/).pop()?.trim() || '';
  const usable = base.startsWith('data:') || base.length > 180 ? '' : base;
  const cleaned = usable.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^\.+/, '').slice(0, 80);
  if (cleaned && cleaned !== '_') return cleaned;
  return `file${EXT_BY_MIME[mimeType || ''] || ''}`;
}

export function readEncodedFile(data: string, fileName?: string): { buffer: Buffer; mimeType: string; originalName: string } {
  const trimmed = data.trim();
  let mimeType = '';
  let payload = trimmed;
  const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(trimmed);
  if (match) {
    mimeType = match[1].toLowerCase();
    payload = match[2];
  }
  const compact = payload.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(compact) || compact.length < 16) {
    throw new Error('The file data is not valid base64');
  }
  const buffer = Buffer.from(compact, 'base64');
  if (!mimeType) {
    const ext = String(fileName || '').split('.').pop()?.toLowerCase() || '';
    mimeType = MIME_BY_EXT[ext] || '';
  }
  if (!mimeType) throw new Error('Include a file type, for example data:image/jpeg;base64,...');
  return { buffer, mimeType, originalName: storedFileName(fileName, mimeType) };
}
