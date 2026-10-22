import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PortalRole } from '../enums';

export const ActiveRole = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PortalRole | null => {
    return ctx.switchToHttp().getRequest().activeRole ?? null;
  },
);

export const RequestId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    return ctx.switchToHttp().getRequest().id;
  },
);
