import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  generateRecoveryCodes,
  normalizeUsername,
  validatePassword,
  validateUsername,
} from '@leximochi/core';
import { ErrorCode, RoleKey, type CaptchaChallenge, type RegisterResponse } from '@leximochi/types';
import { AppError } from '../../common/errors/app-error';
import type { ServerConfig } from '../../config/configuration';
import { AuditService } from '../audit/audit.service';
import {
  RECOVERY_CODE_REPOSITORY,
  type RecoveryCodeRepository,
} from '../users/domain/recovery-code.repository';
import { ROLE_REPOSITORY, type RoleRepository } from '../users/domain/role.repository';
import { USER_REPOSITORY, type UserRepository } from '../users/domain/user.repository';
import { CAPTCHA_PROVIDER, type CaptchaProvider } from './captcha/captcha.provider';
import { PasswordHasher } from './password-hasher';

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject('CONFIG') private readonly config: ServerConfig,
    @Inject(CAPTCHA_PROVIDER) private readonly captcha: CaptchaProvider,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(RECOVERY_CODE_REPOSITORY) private readonly recoveryCodes: RecoveryCodeRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuditService,
  ) {}

  issueCaptcha(ctx: RequestContext): Promise<CaptchaChallenge> {
    return this.captcha.issue({ ip: ctx.ip });
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
      ip: ctx.ip,
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
      // 补偿：注册中途失败时删除残缺账号，避免留下无角色/无恢复码的用户
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
}
