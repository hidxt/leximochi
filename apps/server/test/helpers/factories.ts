import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { DatabaseService } from '../../src/database/database.service';
import { CAPTCHA_PROVIDER } from '../../src/modules/auth/captcha/captcha.provider';
import type { ChallengeCaptchaProvider } from '../../src/modules/auth/captcha/challenge-captcha.provider';
import type { RegisterResponse } from '@leximochi/types';

export async function solveCaptcha(app: INestApplication): Promise<{
  captchaToken: string;
  captchaAnswer: string;
}> {
  const provider = app.get<ChallengeCaptchaProvider>(CAPTCHA_PROVIDER);
  const challenge = await provider.issue({ ip: '127.0.0.1' });
  return { captchaToken: challenge.token, captchaAnswer: provider.solveForTest(challenge.token) };
}

export async function registerUser(
  app: INestApplication,
  username: string,
  password = 'Str0ng-Passphrase',
): Promise<RegisterResponse> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ username, password, ...(await solveCaptcha(app)) });
  if (res.status !== 201) {
    throw new Error(`注册失败: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data as RegisterResponse;
}

export async function loginUser(
  app: INestApplication,
  username: string,
  password = 'Str0ng-Passphrase',
): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .set('x-client-type', 'mobile')
    .send({ username, password });
  if (res.status !== 200) {
    throw new Error(`登录失败: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    accessToken: res.body.data.accessToken as string,
    refreshToken: res.body.data.refreshToken as string,
    userId: res.body.data.user.id as string,
  };
}

export async function registerAndLogin(
  app: INestApplication,
  username: string,
  password = 'Str0ng-Passphrase',
): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
  await registerUser(app, username, password);
  return loginUser(app, username, password);
}

export async function createAdminAndLogin(
  app: INestApplication,
  db: DatabaseService,
  username: string,
  password = 'Adm1n-Passphrase!',
): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
  const registered = await registerUser(app, username, password);
  db.sqlite
    .prepare(
      `INSERT INTO user_roles (user_id, role_id, granted_at)
       SELECT ?, id, ? FROM roles WHERE key = 'admin'`,
    )
    .run(registered.user.id, Date.now());
  return loginUser(app, username, password);
}
