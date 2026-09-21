import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@leximochi/types';
import type { Request } from 'express';
import { AppError } from '../errors/app-error';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from '../../modules/auth/domain/session.repository';
import { TokenService } from '../../modules/auth/token.service';
import { USER_REPOSITORY, type UserRepository } from '../../modules/users/domain/user.repository';

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
}

export const PERMISSIONS_KEY = 'requiredPermissions';

export function RequirePermissions(...permissions: string[]): MethodDecorator & ClassDecorator {
  return SetMetadata(PERMISSIONS_KEY, permissions);
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      if (isPublic) return true;
      throw new AppError(ErrorCode.UNAUTHORIZED, '需要登录', 401);
    }

    const payload = await this.tokens.verifyAccessToken(token).catch(() => null);
    if (!payload) {
      throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, '登录状态无效', 401);
    }

    const session = await this.sessions.findById(payload.sid);
    if (!session || session.revokedAt !== null || session.expiresAt <= Date.now()) {
      throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, '登录状态无效', 401);
    }

    const user = await this.users.findById(payload.sub);
    if (!user || user.status === 'banned') {
      throw new AppError(ErrorCode.AUTH_ACCOUNT_BANNED, '账号不可用', 403);
    }

    // 角色与权限每次请求从数据库读取，保证封禁/降权立即生效
    req.user = {
      userId: user.id,
      sessionId: session.id,
      roles: await this.users.listRoles(user.id),
      permissions: await this.users.listPermissions(user.id),
    };
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user) throw new Error('CurrentUser 只能用于已认证的请求');
    return req.user;
  },
);
