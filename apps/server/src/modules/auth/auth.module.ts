import { Module } from '@nestjs/common';
import type { ServerConfig } from '../../config/configuration';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CAPTCHA_PROVIDER } from './captcha/captcha.provider';
import { ChallengeCaptchaProvider } from './captcha/challenge-captcha.provider';
import { PasswordHasher } from './password-hasher';

@Module({
  imports: [UsersModule, AuditModule],
  controllers: [AuthController],
  providers: [
    PasswordHasher,
    AuthService,
    {
      provide: CAPTCHA_PROVIDER,
      inject: ['CONFIG'],
      useFactory: (config: ServerConfig) =>
        new ChallengeCaptchaProvider({ captchaSecret: config.captchaSecret }),
    },
  ],
  exports: [AuthService, PasswordHasher, CAPTCHA_PROVIDER],
})
export class AuthModule {}
