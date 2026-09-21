import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  generateRecoveryCodes,
  normalizeUsername,
  validatePassword,
  validateUsername,
} from '@leximochi/core';
import {
  ErrorCode,
  RoleKey,
  type CaptchaChallenge,
  type LoginResponse,
  type PublicUser,
  type RegisterResponse,
  type SessionSummary,
} from '@leximochi/types';
import { AppError } from '../../common/errors/app-error';
import { normalizeIp } from '../../common/net/ip';
import type { ServerConfig } from '../../config/configuration';
import { AuditService } from '../audit/audit.service';
import {
  RECOVERY_CODE_REPOSITORY,
  type RecoveryCodeRepository,
} from '../users/domain/recovery-code.repository';
import { ROLE_REPOSITORY, type RoleRepository } from '../users/domain/role.repository';
import { USER_REPOSITORY, type UserRepository } from '../users/domain/user.repository';
import { DUMMY_ARGON2_HASH } from './auth.constants';
import { CAPTCHA_PROVIDER, type CaptchaProvider } from './captcha/captcha.provider';
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from './domain/session.repository';
import { PasswordHasher } from './password-hasher';
import { TokenService } from './token.service';

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject('CONFIG') private readonly config: ServerConfig,
    @Inject(CAPTCHA_PROVIDER) private readonly captcha: CaptchaProvider,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(RECOVERY_CODE_REPOSITORY) private readonly recoveryCodes: RecoveryCodeRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    private readonly tokens: TokenService,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuditService,
  ) {}

  issueCaptcha(ctx: RequestContext): Promise<CaptchaChallenge> {
    return this.captcha.issue({ ip: normalizeIp(ctx.ip) });
  }

  async register(
    input: { username: string; password: string; captchaToken: string; captchaAnswer: string },
    ctx: RequestContext,
  ): Promise<RegisterResponse> {
    const usernameCheck = validateUsername(input.username);
    if (!usernameCheck.ok) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, '用户名不符合要求', 400, {
        username: [usernameCheck.reason],
      });
    }
    const passwordCheck = validatePassword(input.password, { username: input.username });
    if (!passwordCheck.ok) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, '密码不符合要求', 400, {
        password: [passwordCheck.reason],
      });
    }
    const captchaOk = await this.captcha.verify({
      token: input.captchaToken,
      answer: input.captchaAnswer,
      ip: normalizeIp(ctx.ip),
    });
    if (!captchaOk) {
      await this.audit.record({
        actorUserId: null,
        actorType: 'anonymous',
        action: 'auth.register.failed',
        result: 'failure',
        metadata: { reason: 'captcha_failed' },
        ...ctx,
      });
      throw new AppError(ErrorCode.CAPTCHA_FAILED, '人机验证失败，请重试', 400);
    }

    const userRole = await this.roles.findByKey(RoleKey.User);
    if (!userRole) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, '系统角色缺失', 500);
    }

    const now = Date.now();
    const passwordHash = await this.hasher.hash(input.password);
    const user = await this.users.create({
      username: input.username.trim(),
      usernameCanonical: normalizeUsername(input.username),
      passwordHash,
      now,
    });

    try {
      await this.roles.assignRole(user.id, userRole.id, { grantedBy: null, now });
      const plainCodes = generateRecoveryCodes({
        count: this.config.recoveryCodeCount,
        randomBytes,
      });
      const codeHashes = await Promise.all(plainCodes.map((code) => this.hasher.hash(code)));
      await this.recoveryCodes.replaceAllForUser(user.id, codeHashes, now);
      await this.audit.record({
        actorUserId: user.id,
        actorType: 'user',
        action: 'auth.register.succeeded',
        targetType: 'user',
        targetId: user.id,
        result: 'success',
        ...ctx,
      });
      return { user: await this.users.toPublicUser(user), recoveryCodes: plainCodes };
    } catch (error) {
      await this.users.removeById(user.id);
      await this.audit.record({
        actorUserId: null,
        actorType: 'system',
        action: 'auth.register.rolled_back',
        targetType: 'user',
        targetId: user.id,
        result: 'failure',
        ...ctx,
      });
      throw error;
    }
  }

  async login(input: { username: string; password: string }, ctx: RequestContext): Promise<LoginResponse> {
    const canonical = normalizeUsername(input.username);
    const user = await this.users.findByUsernameCanonical(canonical);

    if (!user) {
      // 时序对齐：账号不存在时也执行一次等价耗时的哈希校验
      await this.hasher.verify(DUMMY_ARGON2_HASH, input.password);
      throw new AppError(ErrorCode.AUTH_INVALID_CREDENTIALS, '用户名或密码不正确', 401);
    }
    if (user.status === 'banned') {
      throw new AppError(ErrorCode.AUTH_ACCOUNT_BANNED, '账号已被封禁', 403);
    }

    const passwordOk = await this.hasher.verify(user.passwordHash, input.password);
    if (!passwordOk) {
      await this.audit.record({
        actorUserId: user.id,
        actorType: 'user',
        action: 'auth.login.failed',
        targetType: 'user',
        targetId: user.id,
        result: 'failure',
        ...ctx,
      });
      throw new AppError(ErrorCode.AUTH_INVALID_CREDENTIALS, '用户名或密码不正确', 401);
    }

    const now = Date.now();
    const issued = await this.createSession(user.id, ctx, { familyId: randomUUID(), now });
    await this.users.touchLastLogin(user.id, now);
    await this.audit.record({
      actorUserId: user.id,
      actorType: 'user',
      action: 'auth.login.succeeded',
      targetType: 'user',
      targetId: user.id,
      result: 'success',
      ...ctx,
    });

    return {
      ...issued,
      user: await this.users.toPublicUser(user),
    };
  }

  async refresh(
    input: { refreshToken?: string },
    ctx: RequestContext,
  ): Promise<IssuedTokens> {
    const presented = input.refreshToken;
    if (!presented) {
      throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, '登录状态无效，请重新登录', 401);
    }
    const session = await this.sessions.findByRefreshHash(this.tokens.hashRefreshToken(presented));
    if (!session) {
      throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, '登录状态无效，请重新登录', 401);
    }

    const now = Date.now();
    if (session.revokedAt !== null) {
      // 复用检测：旧 token 被再次使用视为凭证泄漏，撤销整个会话族
      await this.sessions.revokeFamily(session.familyId, 'reuse_detected', now);
      await this.audit.record({
        actorUserId: session.userId,
        actorType: 'user',
        action: 'auth.token.reuse_detected',
        targetType: 'session',
        targetId: session.id,
        result: 'failure',
        ...ctx,
      });
      throw new AppError(
        ErrorCode.AUTH_TOKEN_REUSE_DETECTED,
        '登录状态异常，已登出全部设备',
        401,
      );
    }
    if (session.expiresAt <= now) {
      throw new AppError(ErrorCode.AUTH_TOKEN_EXPIRED, '登录已过期，请重新登录', 401);
    }

    const user = await this.users.findById(session.userId);
    if (!user || user.status === 'banned') {
      await this.sessions.revokeAllForUser(session.userId, 'banned', now);
      throw new AppError(ErrorCode.AUTH_ACCOUNT_BANNED, '账号不可用', 403);
    }

    const rotated = this.tokens.createRefreshToken();
    await this.sessions.revoke(session.id, 'rotated', now);
    const familyId = session.familyId;
    const newSessionId = randomUUID();
    await this.sessions.create({
      id: newSessionId,
      userId: user.id,
      familyId,
      refreshTokenHash: rotated.hash,
      expiresAt: this.tokens.refreshTokenExpiry(now),
      userAgent: ctx.userAgent,
      ip: normalizeIp(ctx.ip),
      now,
    });

    return {
      accessToken: await this.tokens.signAccessToken({
        userId: user.id,
        sessionId: newSessionId,
        roles: await this.users.listRoles(user.id),
      }),
      refreshToken: rotated.token,
      expiresIn: this.tokens.accessTokenTtlSeconds(),
    };
  }

  async logout(
    sessionId: string,
    userId: string,
    input: { refreshToken?: string },
    ctx: RequestContext,
  ): Promise<void> {
    // 仅允许撤销属于该用户的会话；refresh token 若提供则必须与该会话匹配
    const session = await this.sessions.findById(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(ErrorCode.AUTH_SESSION_NOT_FOUND, '会话不存在', 404);
    }
    if (input.refreshToken) {
      const hash = this.tokens.hashRefreshToken(input.refreshToken);
      if (!this.tokens.safeHashEquals(hash, session.refreshTokenHash)) {
        throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, '登录状态无效', 401);
      }
    }
    await this.sessions.revoke(sessionId, 'logout', Date.now());
    await this.audit.record({
      actorUserId: userId,
      actorType: 'user',
      action: 'auth.logout.succeeded',
      targetType: 'session',
      targetId: sessionId,
      result: 'success',
      ...ctx,
    });
  }

  async logoutAll(userId: string, ctx: RequestContext): Promise<void> {
    await this.sessions.revokeAllForUser(userId, 'logout_all', Date.now());
    await this.audit.record({
      actorUserId: userId,
      actorType: 'user',
      action: 'auth.logout_all.succeeded',
      targetType: 'user',
      targetId: userId,
      result: 'success',
      ...ctx,
    });
  }

  async listSessions(userId: string, currentSessionId: string): Promise<SessionSummary[]> {
    const rows = await this.sessions.listActive(userId);
    return rows.map((row) => ({
      id: row.id,
      userAgent: row.userAgent,
      ip: row.ip,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      isCurrent: row.id === currentSessionId,
    }));
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessions.findById(sessionId);
    // 他人会话与不存在的会话统一返回 404，避免泄露会话是否存在
    if (!session || session.userId !== userId) {
      throw new AppError(ErrorCode.AUTH_SESSION_NOT_FOUND, '会话不存在', 404);
    }
    await this.sessions.revoke(sessionId, 'logout', Date.now());
  }

  async currentUser(userId: string): Promise<{ user: PublicUser; permissions: string[] }> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, '用户不存在', 404);
    }
    return {
      user: await this.users.toPublicUser(user),
      permissions: await this.users.listPermissions(userId),
    };
  }

  private async createSession(
    userId: string,
    ctx: RequestContext,
    options: { familyId: string; now: number },
  ): Promise<IssuedTokens> {
    const sessionId = randomUUID();
    const refresh = this.tokens.createRefreshToken();
    await this.sessions.create({
      id: sessionId,
      userId,
      familyId: options.familyId,
      refreshTokenHash: refresh.hash,
      expiresAt: this.tokens.refreshTokenExpiry(options.now),
      userAgent: ctx.userAgent,
      ip: normalizeIp(ctx.ip),
      now: options.now,
    });
    return {
      accessToken: await this.tokens.signAccessToken({
        userId,
        sessionId,
        roles: await this.users.listRoles(userId),
      }),
      refreshToken: refresh.token,
      expiresIn: this.tokens.accessTokenTtlSeconds(),
    };
  }
}
