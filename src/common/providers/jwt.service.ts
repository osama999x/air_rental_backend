import { Injectable } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtCustomService {
  constructor(
    private readonly jwtService: NestJwtService,
    private readonly configService: ConfigService,
  ) {}

  async signAccess(data: Record<string, unknown>, expiresIn?: number): Promise<string> {
    return this.jwtService.sign(data, {
      secret: this.secret('JWT_SECRET'),
      expiresIn: expiresIn || this.seconds('ACCESS_TOKEN_EXPIRES_IN', 900),
    });
  }

  async signRefresh(data: Record<string, unknown>, expiresIn?: number): Promise<string> {
    return this.jwtService.sign(data, {
      secret: this.secret('REFRESH_KEY'),
      expiresIn: expiresIn || this.seconds('REFRESH_KEY_EXPIRES_IN', 60 * 60 * 24 * 30),
    });
  }

  async verifyAccess(token: string): Promise<any> {
    return this.jwtService.verify(token, { secret: this.secret('JWT_SECRET') });
  }

  async verifyRefresh(token: string): Promise<any> {
    return this.jwtService.verify(token, { secret: this.secret('REFRESH_KEY') });
  }

  private secret(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) throw new Error(`${key} is not configured`);
    return value;
  }

  private seconds(key: string, fallback: number): number {
    const value = Number(this.configService.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
