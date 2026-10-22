import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtCustomService } from '../providers/jwt.service';
import { AdminAccount, User } from '../../database/entities';
import { AdminStatus, UserStatus } from '../enums';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtCustomService,
    private readonly reflector: Reflector,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AdminAccount) private readonly admins: Repository<AdminAccount>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.readBearer(request.headers.authorization);
    const adminRoute = String(request.originalUrl || request.url || '').includes('/admin/');

    try {
      const payload = await this.jwtService.verifyAccess(token);
      if (adminRoute) {
        if (payload.aud !== 'admin') {
          throw new UnauthorizedException('Admin authentication is required');
        }
        const admin = await this.admins.findOne({ where: { id: payload.sub } });
        if (!admin || admin.status !== AdminStatus.ACTIVE) {
          throw new UnauthorizedException('Admin account is not active');
        }
        request.admin = admin;
        request.tokenPayload = payload;
        return true;
      }
      if (payload.aud && payload.aud !== 'user') {
        throw new UnauthorizedException('User authentication is required');
      }
      const user = await this.users.findOne({ where: { id: payload.sub } });
      if (!user || user.status === UserStatus.SUSPENDED || user.status === UserStatus.DEACTIVATED) {
        throw new UnauthorizedException('Account is not allowed to sign in');
      }
      request.user = user;
      request.tokenPayload = payload;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private readBearer(header?: string): string {
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('You are not logged in');
    }
    const token = header.slice(7).trim();
    if (!token) throw new UnauthorizedException('You are not logged in');
    return token;
  }
}
