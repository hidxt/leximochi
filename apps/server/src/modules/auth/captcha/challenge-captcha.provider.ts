import { Injectable } from '@nestjs/common';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { CaptchaChallenge } from '@leximochi/types';
import { normalizeIp } from '../../../common/net/ip';
import type { CaptchaProvider } from './captcha.provider';

const TTL_MS = 120_000;

interface ChallengePayload {
  jti: string;
  answer: number;
  exp: number;
  ip: string | null;
}

@Injectable()
export class ChallengeCaptchaProvider implements CaptchaProvider {
  private readonly consumed = new Set<string>();
  private readonly options: { captchaSecret: string; now?: () => number };

  constructor(options: { captchaSecret: string; now?: () => number }) {
    this.options = options;
  }

  async issue(ctx: { ip: string | null }): Promise<CaptchaChallenge> {
    const left = randomInt(10, 99);
    const right = randomInt(10, 99);
    const payload: ChallengePayload = {
      jti: randomUUID(),
      answer: left + right,
      exp: this.now() + TTL_MS,
      ip: normalizeIp(ctx.ip),
    };
    return {
      token: this.sign(payload),
      question: `${left} + ${right} = ?`,
      expiresAt: payload.exp,
    };
  }

  async verify(input: { token: string; answer: string; ip: string | null }): Promise<boolean> {
    const payload = this.parse(input.token);
    if (!payload) return false;
    if (payload.exp < this.now()) return false;
    if (this.consumed.has(payload.jti)) return false;
    if (payload.ip !== normalizeIp(input.ip)) return false;
    const provided = String(input.answer).trim();
    if (!/^[0-9]{1,4}$/.test(provided)) return false;
    this.consumed.add(payload.jti);
    return this.safeEqual(String(payload.answer), String(Number(provided)));
  }

  /** 仅供测试使用，生产代码禁止调用 */
  solveForTest(token: string): string {
    const payload = this.parse(token);
    if (!payload) throw new Error('挑战无效');
    return String(payload.answer);
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  private sign(payload: ChallengePayload): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${body}.${this.hmac(body)}`;
  }

  private parse(token: string): ChallengePayload | null {
    const [body, signature] = token.split('.');
    if (!body || !signature) return null;
    if (!this.safeEqual(this.hmac(body), signature)) return null;
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ChallengePayload;
    } catch {
      return null;
    }
  }

  private hmac(value: string): string {
    return createHmac('sha256', this.options.captchaSecret).update(value).digest('base64url');
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
