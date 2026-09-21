import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { buildTestApp } from './helpers/test-app';
import { buildTestEnv } from './helpers/test-env';
import { createDatabase, type DatabaseService } from '../src/database/database.service';
import { runMigrations } from '../src/database/migrate';
import { seedSystemRoles } from '../src/database/seed/roles.seed';
import { DATABASE } from '../src/database/database.constants';
import { CAPTCHA_PROVIDER } from '../src/modules/auth/captcha/captcha.provider';
import { ChallengeCaptchaProvider } from '../src/modules/auth/captcha/challenge-captcha.provider';

const MIGRATIONS = `${__dirname}/../drizzle`;

describe('POST /auth/register', () => {
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
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  async function captcha(): Promise<{ captchaToken: string; captchaAnswer: string }> {
    const provider = app.get<ChallengeCaptchaProvider>(CAPTCHA_PROVIDER);
    const challenge = await provider.issue({ ip: '127.0.0.1' });
    return { captchaToken: challenge.token, captchaAnswer: provider.solveForTest(challenge.token) };
  }

  it('注册成功并一次性返回 10 个恢复码，库中只有哈希', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'alice_01', password: 'Str0ng-Passphrase', ...(await captcha()) });

    expect(res.status).toBe(201);
    expect(res.body.data.user.username).toBe('alice_01');
    expect(res.body.data.user.roles).toEqual(['user']);
    expect(res.body.data.recoveryCodes).toHaveLength(10);

    const rows = db.sqlite
      .prepare('SELECT code_hash FROM recovery_codes WHERE user_id = ?')
      .all(res.body.data.user.id) as Array<{ code_hash: string }>;
    expect(rows).toHaveLength(10);
    for (const code of res.body.data.recoveryCodes) {
      expect(rows.map((r) => r.code_hash)).not.toContain(code);
    }
  });

  it('重复用户名（大小写不同）返回 409', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'Alice_01', password: 'Str0ng-Passphrase', ...(await captcha()) });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('AUTH_USERNAME_TAKEN');
  });

  it('弱密码返回 400 且不创建用户', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'bob_02', password: 'password1234', ...(await captcha()) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const count = db.sqlite
      .prepare("SELECT COUNT(*) AS c FROM users WHERE username_canonical = 'bob_02'")
      .get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('验证码错误返回 400 CAPTCHA_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: 'carol_03',
        password: 'Str0ng-Passphrase',
        ...(await captcha()),
        captchaAnswer: '9999',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CAPTCHA_FAILED');
  });

  it('未声明的字段被拒绝（DTO 白名单）', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: 'dave_04',
        password: 'Str0ng-Passphrase',
        ...(await captcha()),
        isAdmin: true,
      });
    expect(res.status).toBe(400);
  });

  it('响应不含密码哈希与内部字段', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'erin_05', password: 'Str0ng-Passphrase', ...(await captcha()) });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|\$argon2/);
  });

  it('注册成功写入审计事件且不含秘密', async () => {
    const rows = db.sqlite
      .prepare("SELECT action, metadata_json FROM audit_logs WHERE action = 'auth.register.succeeded'")
      .all() as Array<{ action: string; metadata_json: string | null }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toMatch(/\$argon2|recoveryCodes|Str0ng/);
  });
});
