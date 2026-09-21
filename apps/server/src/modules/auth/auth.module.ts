import { Module } from '@nestjs/common';
import { DrizzleSessionRepository } from '../../database/repositories/drizzle-session.repository';
import type { ServerConfig } from '../../config/configuration';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CAPTCHA_PROVIDER } from './captcha/captcha.provider';
import { ChallengeCaptchaProvider } from './captcha/challenge-captcha.provider';
import { SESSION_REPOSITORY } from './domain/session.repository';
import { PasswordHasher } from './password-hasher';
import { TokenService } from './token.service';

@Module({
  imports: [UsersModule, AuditModule],
  controllers: [AuthController],
  providers: [
    PasswordHasher,
    AuthService,
    DrizzleSessionRepository,
    { provide: SESSION_REPOSITORY, useExisting: DrizzleSessionRepository },
    {
      provide: TokenService,
      inject: ['CONFIG'],
      useFactory: (config: ServerConfig) =>
        new TokenService({
          jwtSecret: config.jwtSecret,
          refreshTokenSecret: config.refreshTokenSecret,
          accessTokenTtlSeconds: config.accessTokenTtlSeconds,
          refreshTokenTtlDays: config.refreshTokenTtlDays,
        }),
    },
    {
      provide: CAPTCHA_PROVIDER,
      inject: ['CONFIG'],
      useFactory: (config: ServerConfig) =>
        new ChallengeCaptchaProvider({ captchaSecret: config.captchaSecret }),
    },
  ],
  exports: [AuthService, PasswordHasher, TokenService, CAPTCHA_PROVIDER, SESSION_REPOSITORY],
})
export class AuthModule {}
