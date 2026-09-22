import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@leximochi/types';
import { AppError } from '../errors/app-error';
import { PERMISSIONS_KEY, type AuthenticatedUser } from './jwt-auth.guard';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const granted = req.user?.permissions ?? [];
    const allowed = required.every((permission) => granted.includes(permission));
    if (!allowed) {
      // 统一 403，不区分「无权限」与「资源不存在」，避免泄露后台结构
      throw new AppError(ErrorCode.FORBIDDEN, '没有权限执行该操作', 403);
    }
    return true;
  }
}
