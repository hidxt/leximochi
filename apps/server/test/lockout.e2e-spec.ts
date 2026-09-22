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
import { registerUser } from './helpers/factories';

const MIGRATIONS = `${__dirname}/../drizzle`;

describe('登录暴力破解防护', () => {
  let app: INestApplication;
  let db: DatabaseService;

  beforeAll(async () => {
    db = createDatabase(':memory:');
    runMigrations(db, MIGRATIONS);
    seedSystemRoles(db);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('CONFIG')
      .useValue(
        buildTestEnv({
          LOGIN_MAX_FAILURES_PER_USER: '5',
          LOGIN_MAX_FAILURES_PER_IP: '1000',
          LOCKOUT_WINDOW_MINUTES: '15',
        }),
      )
      .overrideProvider(DATABASE)
      .useValue(db)
      .compile();
    app = await buildTestApp(moduleRef);
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  const login = (username: string, password: string) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username, password });

  it('连续失败达到阈值后锁定并返回 429，且写入审计', async () => {
    await registerUser(app, 'laura_13');

    for (let i = 0; i < 5; i += 1) {
      const res = await login('laura_13', 'Wr0ng-Passphrase!');
      expect(res.status).toBe(401);
    }

    // 即使密码正确也被锁定
    const locked = await login('laura_13', 'Str0ng-Passphrase');
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('AUTH_ACCOUNT_LOCKED');

    const audit = db.sqlite
      .prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'auth.login.locked'")
      .get() as { c: number };
    expect(audit.c).toBeGreaterThan(0);
  });

  it('失败计数按用户名隔离：另一个账号不受影响', async () => {
    await registerUser(app, 'nina_14');
    const res = await login('nina_14', 'Str0ng-Passphrase');
    expect(res.status).toBe(200);
  });

  it('成功登录会清除该用户名的失败计数', async () => {
    await registerUser(app, 'mike_15');
    await login('mike_15', 'Wr0ng-Passphrase!');
    const auditBefore = db.sqlite
      .prepare(
        "SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'auth.login.failed' AND target_id = (SELECT id FROM users WHERE username_canonical = 'mike_15')",
      )
      .get() as { c: number };
    expect(auditBefore.c).toBe(1);

    const ok = await login('mike_15', 'Str0ng-Passphrase');
    expect(ok.status).toBe(200);

    // 清除后仍可正常登录，不会被历史失败累计锁定
    for (let i = 0; i < 4; i += 1) {
      const res = await login('mike_15', 'Wr0ng-Passphrase!');
      expect(res.status).toBe(401);
    }
    const stillAllowed = await login('mike_15', 'Str0ng-Passphrase');
    expect(stillAllowed.status).toBe(200);
  });

  it('捕获 auth_attempts 记录登录失败与成功', async () => {
    await registerUser(app, 'oscar_16');
    await login('oscar_16', 'Wr0ng-Passphrase!');
    await login('oscar_16', 'Str0ng-Passphrase');

    const failed = db.sqlite
      .prepare(
        "SELECT COUNT(*) AS c FROM auth_attempts WHERE kind = 'login' AND username_canonical = 'oscar_16' AND success = 0",
      )
      .get() as { c: number };
    const succeeded = db.sqlite
      .prepare(
        "SELECT COUNT(*) AS c FROM auth_attempts WHERE kind = 'login' AND username_canonical = 'oscar_16' AND success = 1",
      )
      .get() as { c: number };

    // 成功登录后失败记录被清除，成功记录保留
    expect(failed.c).toBe(0);
    expect(succeeded.c).toBeGreaterThanOrEqual(1);
  });
});
