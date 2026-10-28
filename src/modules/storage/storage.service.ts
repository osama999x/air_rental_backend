import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import { randomToken } from '../../common/utils/tokens.util';
import { assertAllowedUpload, readEncodedFile, storedFileName } from '../../common/utils/files.util';

@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(private readonly config: ConfigService) {
    this.root = resolve(process.cwd(), this.config.get<string>('STORAGE_DIR') || 'storage/private');
  }

  async save(buffer: Buffer, originalName: string): Promise<string> {
    const key = `${new Date().getUTCFullYear()}/${randomToken(16)}-${storedFileName(originalName)}`;
    const full = this.resolve(key);
    await fs.mkdir(dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
    return key;
  }

  async keep(options: {
    file?: Express.Multer.File;
    data?: string;
    fileName?: string;
    required?: boolean;
  }): Promise<{ storageKey: string; mimeType: string; originalName: string } | null> {
    let buffer: Buffer | undefined;
    let mimeType = '';
    let originalName = '';
    if (options.file?.buffer?.length) {
      buffer = options.file.buffer;
      mimeType = options.file.mimetype;
      originalName = storedFileName(options.file.originalname || options.fileName, mimeType);
    } else if (options.data?.trim()) {
      try {
        const decoded = readEncodedFile(options.data, options.fileName);
        buffer = decoded.buffer;
        mimeType = decoded.mimeType;
        originalName = decoded.originalName;
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'The file data is not valid base64');
      }
    }
    if (!buffer) {
      if (options.required === false) return null;
      throw new BadRequestException('Choose a file');
    }
    try {
      assertAllowedUpload(mimeType, buffer.length, uploadLimitBytes(this.config));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Unsupported file type');
    }
    return {
      storageKey: await this.save(buffer, originalName),
      mimeType,
      originalName: originalName.slice(0, 160),
    };
  }

  publicUrl(downloadPath: string): string {
    const configured = String(process.env.APP_PUBLIC_URL || '').trim().replace(/\/$/, '');
    const port = Number(this.config.get('PORT')) || 3009;
    const origin = configured || `http://179.236.65.153:${port}`;
    return `${origin}/api/v1/${downloadPath.replace(/^\//, '')}`;
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
