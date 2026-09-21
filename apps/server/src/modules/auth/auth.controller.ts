import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { CaptchaChallenge, RegisterResponse } from '@leximochi/types';
import { Public } from '../../common/decorators/public.decorator';
import type { RequestWithId } from '../../common/middleware/request-context.middleware';
import { AuthService, type RequestContext } from './auth.service';
import { RegisterDto } from './dto/register.dto';

export function toContext(req: RequestWithId): RequestContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.header('user-agent') ?? null,
    requestId: req.requestId ?? null,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('captcha')
  @HttpCode(200)
  async captcha(@Req() req: RequestWithId): Promise<{ data: CaptchaChallenge }> {
    return { data: await this.auth.issueCaptcha(toContext(req)) };
  }

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: RequestWithId,
  ): Promise<{ data: RegisterResponse }> {
    return { data: await this.auth.register(dto, toContext(req)) };
  }
}
