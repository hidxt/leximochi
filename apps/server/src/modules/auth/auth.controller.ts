import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  MOBILE_CLIENT_HEADER,
  REFRESH_TOKEN_COOKIE_NAME,
  type CaptchaChallenge,
  type LoginResponse,
  type MeResponse,
  type RecoveryResponse,
  type RegisterResponse,
  type SessionSummary,
} from '@leximochi/types';
import type { ServerConfig } from '../../config/configuration';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import type { RequestWithId } from '../../common/middleware/request-context.middleware';
import { AuthService, type IssuedTokens, type RequestContext } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto, RefreshDto } from './dto/refresh.dto';
import { RecoveryDto } from './dto/recovery.dto';
import { RegisterDto } from './dto/register.dto';

function toContext(req: RequestWithId): RequestContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.header('user-agent') ?? null,
    requestId: req.requestId ?? null,
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject('CONFIG') private readonly config: ServerConfig,
  ) {}

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

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: RequestWithId,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: LoginResponse | Omit<LoginResponse, 'refreshToken'> }> {
    const result = await this.auth.login(dto, toContext(req));
    return { data: this.applyRefreshTransport(result, req, res) };
  }

  @Public()
  @Post('recovery')
  @HttpCode(200)
  async recovery(
    @Body() dto: RecoveryDto,
    @Req() req: RequestWithId,
  ): Promise<{ data: RecoveryResponse }> {
    return { data: await this.auth.recover(dto, toContext(req)) };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: RequestWithId,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: IssuedTokens | Omit<IssuedTokens, 'refreshToken'> }> {
    const refreshToken = this.readRefreshToken(req, dto.refreshToken);
    const result = await this.auth.refresh({ refreshToken }, toContext(req));
    return { data: this.applyRefreshTransport(result, req, res) };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LogoutDto,
    @Req() req: RequestWithId,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: { ok: boolean } }> {
    const refreshToken = this.readRefreshToken(req, dto.refreshToken);
    await this.auth.logout(user.sessionId, user.userId, { refreshToken }, toContext(req));
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/auth' });
    return { data: { ok: true } };
  }

  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestWithId,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: { ok: boolean } }> {
    await this.auth.logoutAll(user.userId, toContext(req));
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/auth' });
    return { data: { ok: true } };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<{ data: MeResponse }> {
    return { data: await this.auth.currentUser(user.userId) };
  }

  @Get('sessions')
  async sessions(@CurrentUser() user: AuthenticatedUser): Promise<{ data: SessionSummary[] }> {
    return { data: await this.auth.listSessions(user.userId, user.sessionId) };
  }

  @Delete('sessions/:id')
  @HttpCode(200)
  async deleteSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ data: { ok: boolean } }> {
    await this.auth.deleteSession(user.userId, id);
    return { data: { ok: true } };
  }

  /**
   * 凭证传输方式：移动端（`x-client-type: mobile`）从 Body 获取 refresh token；
   * 其余客户端使用 HttpOnly Cookie。该请求头只影响传输方式，不授予任何权限。
   */
  private applyRefreshTransport<T extends { refreshToken?: string }>(
    result: T,
    req: Request,
    res: Response,
  ): T | Omit<T, 'refreshToken'> {
    if (this.isMobileClient(req)) {
      return result;
    }
    if (!result.refreshToken) {
      return result;
    }
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, result.refreshToken, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'lax',
      path: '/auth',
      maxAge: this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    });
    const { refreshToken: _omitted, ...rest } = result;
    return rest;
  }

  private readRefreshToken(req: RequestWithId, fromBody?: string): string | undefined {
    if (this.isMobileClient(req)) {
      return fromBody;
    }
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[REFRESH_TOKEN_COOKIE_NAME] ?? fromBody;
  }

  private isMobileClient(req: Request): boolean {
    return req.header(MOBILE_CLIENT_HEADER) === 'mobile';
  }
}
