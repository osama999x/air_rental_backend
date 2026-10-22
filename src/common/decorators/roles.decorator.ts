import { SetMetadata } from '@nestjs/common';
import { PortalRole } from '../enums';

export const ROLES_KEY = 'portalRoles';
export const Roles = (...roles: PortalRole[]) => SetMetadata(ROLES_KEY, roles);
