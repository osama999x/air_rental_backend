import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import { randomToken } from '../../common/utils/tokens.util';
import { safeFileName } from '../../common/utils/files.util';

@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(private readonly config: ConfigService) {
    this.root = resolve(process.cwd(), this.config.get<string>('STORAGE_DIR') || 'storage/private');
  }

  async save(buffer: Buffer, originalName: string): Promise<string> {
    const key = `${new Date().getUTCFullYear()}/${randomToken(16)}-${safeFileName(originalName || 'file')}`;
    const full = this.resolve(key);
    await fs.mkdir(dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
    return key;
  }

  open(key: string) {
    return createReadStream(this.resolve(key));
  }

  resolve(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root)) {
      throw new Error('Invalid storage key');
    }
    return full;
  }

  status() {
    const driver = this.config.get<string>('STORAGE_DRIVER') || 'local';
    const configured = driver === 's3'
      ? Boolean(this.config.get('S3_BUCKET') && this.config.get('S3_ACCESS_KEY_ID'))
      : true;
    return {
      driver,
      configured,
      note: configured && driver === 'local'
        ? 'Files are stored on the application server. Configure S3 for production object storage.'
        : configured
          ? 'S3 credentials are present. The local adapter is still the active writer until an S3 client is enabled.'
          : 'Object storage credentials are missing.',
    };
  }
}

export function uploadLimitBytes(config: ConfigService): number {
  return (Number(config.get('UPLOAD_MAX_MB')) || 10) * 1024 * 1024;
}
