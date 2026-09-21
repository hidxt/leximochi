import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  roles: string[];
  iat: number;
  exp: number;
}

export interface TokenServiceOptions {
  jwtSecret: string;
  refreshTokenSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
}

@Injectable()
export class TokenService {
  private readonly jwt: JwtService;
  private readonly options: TokenServiceOptions;

  constructor(options: TokenServiceOptions) {
    this.options = options;
    this.jwt = new JwtService({
      secret: options.jwtSecret,
      signOptions: { expiresIn: options.accessTokenTtlSeconds },
    });
  }

  signAccessToken(input: { userId: string; sessionId: string; roles: string[] }): Promise<string> {
    return this.jwt.signAsync({ sub: input.userId, sid: input.sessionId, roles: input.roles });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return (await this.jwt.verifyAsync(token)) as AccessTokenPayload;
  }

  createRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashRefreshToken(token) };
  }

  /**
   * Refresh Token 是高熵随机串（256 bit），不存在字典攻击面，
   * 因此用 HMAC-SHA256 + 服务端密钥而非慢哈希；pepper 保证仅泄漏数据库不足以伪造。
   */
  hashRefreshToken(token: string): string {
    return createHmac('sha256', this.options.refreshTokenSecret).update(token).digest('hex');
  }

  safeHashEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  refreshTokenExpiry(now: number = Date.now()): number {
    return now + this.options.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
  }

  accessTokenTtlSeconds(): number {
    return this.options.accessTokenTtlSeconds;
  }
}
