import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PortalRole } from '../enums';
import { UserRole } from '../../database/entities';
import { resolveActiveRole } from '../../modules/access/access.policy';

@Injectable()
export class PortalContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(UserRole) private readonly roles: Repository<UserRole>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest();
    if (isPublic || request.admin || !request.user) return true;

    const held = (await this.roles.find({ where: { userId: request.user.id } })).map(
      (role) => role.role,
    );
    request.heldRoles = held;
    const requested = request.headers['x-portal-role'] as string | undefined;
    try {
      request.activeRole = resolveActiveRole(
        held,
        requested,
        request.user.preferredPortalRole,
      );
    } catch {
      throw new ForbiddenException('The selected portal role is not assigned to this account');
    }

    const required = this.reflector.getAllAndOverride<PortalRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.length && !required.includes(request.activeRole)) {
      throw new ForbiddenException('This action is not available in the active portal');
    }
    return true;
  }
}
