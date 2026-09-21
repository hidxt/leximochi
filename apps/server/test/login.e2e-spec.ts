import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DATABASE } from '../src/database/database.constants';
import { createDatabase, type DatabaseService } from '../src/database/database.service';
import { runMigrations } from '../src/database/migrate';
import { seedSystemRoles } from '../src/database/seed/roles.seed';
import { buildTestApp } from './helpers/test-app';
import { buildTestEnv } from './helpers/test-env';
import { loginUser, registerUser, solveCaptcha } from './helpers/factories';

const MIGRATIONS = `${__dirname}/../drizzle`;

describe('登录与 Token 生命周期', () => {
  let app: INestApplication;
  let db: DatabaseService;

  beforeAll(async () => {
    db = createDatabase(':memory:');
    runMigrations(db, MIGRATIONS);
    seedSystemRoles(db);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('CONFIG')
      .useValue(buildTestEnv())
      .overrideProvider(DATABASE)
      .useValue(db)
      .compile();
    app = await buildTestApp(moduleRef);
    await registerUser(app, 'alice_01');
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  const login = (username = 'alice_01', password = 'Str0ng-Passphrase') =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username, password });

  it('登录成功返回 access 与 refresh token', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');
    expect(res.body.data.user.username).toBe('alice_01');
  });

  it('密码错误与用户不存在返回同一错误码，避免枚举账号', async () => {
    const wrongPassword = await login('alice_01', 'Wr0ng-Passphrase!');
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');

    const unknownUser = await login('not_exists_99', 'Wr0ng-Passphrase!');
    expect(unknownUser.status).toBe(401);
    expect(unknownUser.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('refresh 轮换：旧 token 立即失效并触发复用检测（撤销整个会话族）', async () => {
    const first = await login();
    const oldRefresh = first.body.data.refreshToken as string;

    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: oldRefresh });
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.refreshToken).not.toBe(oldRefresh);

    const reused = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: oldRefresh });
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('AUTH_TOKEN_REUSE_DETECTED');

    // 族内最新 token 也已被撤销
    const afterReuse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: rotated.body.data.refreshToken });
    expect(afterReuse.status).toBe(401);

    const reuseAudit = db.sqlite
      .prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'auth.token.reuse_detected'")
      .get() as { c: number };
    expect(reuseAudit.c).toBeGreaterThan(0);
  });

  it('未携带 access token 访问受保护接口返回 401', async () => {
    const res = await request(app.getHttpServer()).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('携带有效 access token 可访问 /auth/me', async () => {
    const session = await loginUser(app, 'alice_01');
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('authorization', `Bearer ${session.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe('alice_01');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('登出后该会话的 access 与 refresh token 均失效', async () => {
    const session = await loginUser(app, 'alice_01');

    const logout = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('x-client-type', 'mobile')
      .set('authorization', `Bearer ${session.accessToken}`)
      .send({ refreshToken: session.refreshToken });
    expect(logout.status).toBe(200);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('authorization', `Bearer ${session.accessToken}`);
    expect(me.status).toBe(401);

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: session.refreshToken });
    expect(refreshed.status).toBe(401);
  });

  it('封禁用户无法登录', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    db.sqlite
      .prepare("UPDATE users SET status = 'banned', banned_reason = 'test' WHERE username_canonical = 'alice_01'")
      .run();

    const banned = await login();
    expect(banned.status).toBe(403);
    expect(banned.body.error.code).toBe('AUTH_ACCOUNT_BANNED');

    db.sqlite
      .prepare("UPDATE users SET status = 'active', banned_reason = NULL WHERE username_canonical = 'alice_01'")
      .run();
  });

  it('Web 端登录使用 HttpOnly Cookie 且响应体不含 refresh token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'alice_01', password: 'Str0ng-Passphrase' });
    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).toBeUndefined();
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((cookie) => cookie.startsWith('leximochi_rt='))).toBe(true);
    expect(cookies.some((cookie) => cookie.includes('HttpOnly'))).toBe(true);
  });

  it('响应不泄露密码哈希与内部字段', async () => {
    const res = await login();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|\$argon2|refreshTokenHash/);
  });

  it('验证码接口仍可匿名访问（@Public 生效）', async () => {
    const res = await request(app.getHttpServer()).post('/auth/captcha');
    expect(res.status).toBe(200);
    expect(typeof res.body.data.question).toBe('string');
  });

  it('登录失败会写审计但不包含请求体或密码', async () => {
    await login('alice_01', 'Wr0ng-Passphrase!');
    const rows = db.sqlite
      .prepare("SELECT metadata_json FROM audit_logs WHERE action = 'auth.login.failed'")
      .all() as Array<{ metadata_json: string | null }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toMatch(/Wr0ng|Str0ng|password/);
  });

  it('solveCaptcha 帮助函数可用于注册（回归保障）', async () => {
    const captcha = await solveCaptcha(app);
    expect(captcha.captchaToken.length).toBeGreaterThan(10);
  });
});
