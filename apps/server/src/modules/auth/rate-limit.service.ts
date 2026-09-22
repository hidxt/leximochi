import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '@leximochi/types';
import { AppError } from '../../common/errors/app-error';
import { normalizeIp } from '../../common/net/ip';
import {
  AUTH_ATTEMPT_REPOSITORY,
  type AuthAttemptRepository,
} from './domain/auth-attempt.repository';

export type AttemptKind = 'login' | 'register' | 'refresh' | 'recovery' | 'captcha';

export interface LockoutPolicy {
  maxFailuresPerUser: number;
  maxFailuresPerIp: number;
  windowMinutes: number;
}

const REGISTER_MAX_PER_IP_PER_HOUR = 10;
const RECOVERY_MAX_PER_USER_PER_HOUR = 5;
const CAPTCHA_MAX_PER_IP_PER_10_MIN = 30;

@Injectable()
export class RateLimitService {
  private readonly clock: () => number;

  constructor(
    @Inject(AUTH_ATTEMPT_REPOSITORY) private readonly attempts: AuthAttemptRepository,
    private readonly lockout: LockoutPolicy,
    clock: () => number = Date.now,
  ) {
    this.clock = clock;
  }

  windowMs(): number {
    return this.lockout.windowMinutes * 60 * 1000;
  }

  async assertLoginAllowed(input: {
    usernameCanonical: string;
    ip: string | null;
  }): Promise<void> {
    const since = this.clock() - this.windowMs();
    const perUser = await this.attempts.countFailures({
      kind: 'login',
      usernameCanonical: input.usernameCanonical,
      since,
    });
    if (perUser >= this.lockout.maxFailuresPerUser) {
      throw new AppError(
        ErrorCode.AUTH_ACCOUNT_LOCKED,
        `登录尝试过于频繁，请 ${this.lockout.windowMinutes} 分钟后再试`,
        429,
      );
    }
    const ip = normalizeIp(input.ip);
    if (ip) {
      const perIp = await this.attempts.countFailures({ kind: 'login', ip, since });
      if (perIp >= this.lockout.maxFailuresPerIp) {
        throw new AppError(ErrorCode.RATE_LIMITED, '登录尝试过于频繁，请稍后再试', 429);
      }
    }
  }

  async assertRegisterAllowed(ip: string | null): Promise<void> {
    const normalized = normalizeIp(ip);
    if (!normalized) return;
    const count = await this.attempts.countFailures({
      kind: 'register',
      ip: normalized,
      since: this.clock() - 60 * 60 * 1000,
    });
    if (count >= REGISTER_MAX_PER_IP_PER_HOUR) {
      throw new AppError(ErrorCode.RATE_LIMITED, '注册过于频繁，请稍后再试', 429);
    }
  }

  async assertRecoveryAllowed(usernameCanonical: string): Promise<void> {
    const count = await this.attempts.countFailures({
      kind: 'recovery',
      usernameCanonical,
      since: this.clock() - 60 * 60 * 1000,
    });
    if (count >= RECOVERY_MAX_PER_USER_PER_HOUR) {
      throw new AppError(ErrorCode.RATE_LIMITED, '恢复码尝试过于频繁，请稍后再试', 429);
    }
  }

  async assertCaptchaAllowed(ip: string | null): Promise<void> {
    const normalized = normalizeIp(ip);
    if (!normalized) return;
    const count = await this.attempts.countFailures({
      kind: 'captcha',
      ip: normalized,
      since: this.clock() - 10 * 60 * 1000,
    });
    if (count >= CAPTCHA_MAX_PER_IP_PER_10_MIN) {
      throw new AppError(ErrorCode.RATE_LIMITED, '请求过于频繁，请稍后再试', 429);
    }
  }

  async record(input: {
    kind: AttemptKind;
    usernameCanonical?: string | null;
    ip: string | null;
    success: boolean;
  }): Promise<void> {
    await this.attempts.record({
      id: randomUUID(),
      kind: input.kind,
      usernameCanonical: input.usernameCanonical ?? null,
      ip: normalizeIp(input.ip),
      success: input.success,
      createdAt: this.clock(),
    });
  }

  async clearLoginFailures(usernameCanonical: string): Promise<void> {
    await this.attempts.clearForUser('login', usernameCanonical);
  }
}
