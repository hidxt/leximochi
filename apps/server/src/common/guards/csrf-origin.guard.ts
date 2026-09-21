import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ErrorCode, REFRESH_TOKEN_COOKIE_NAME } from '@leximochi/types';
import { AppError } from '../errors/app-error';
import type { ServerConfig } from '../../config/configuration';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  constructor(@Inject('CONFIG') private readonly config: ServerConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    // 仅携带会话 Cookie 的请求存在 CSRF 面；移动端通过 Body 传凭证，不受此约束
    const hasSessionCookie = Boolean(
      req.headers.cookie?.includes(`${REFRESH_TOKEN_COOKIE_NAME}=`),
    );
    if (!hasSessionCookie) return true;
    const origin = req.header('origin');
    if (!origin || !this.config.corsOrigins.includes(origin)) {
      throw new AppError(ErrorCode.FORBIDDEN, '请求来源不被允许', 403);
    }
    return true;
  }
}
