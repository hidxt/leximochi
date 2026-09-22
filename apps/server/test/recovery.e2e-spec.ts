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

describe('POST /auth/recovery（一次性恢复码）', () => {
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

  const recover = async (
    username: string,
    recoveryCode: string,
    newPassword: string,
  ): Promise<request.Response> =>
    request(app.getHttpServer())
      .post('/auth/recovery')
      .send({ username, recoveryCode, newPassword, ...(await solveCaptcha(app)) });

  const login = (username: string, password: string) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username, password });

  it('使用恢复码重置密码成功，返回新的恢复码组', async () => {
    const registered = await registerUser(app, 'frank_06');
    const oldCodes = registered.recoveryCodes;

    const res = await recover('frank_06', oldCodes[0]!, 'N3w-Passphrase!');
    expect(res.status).toBe(200);
    expect(res.body.data.recoveryCodes).toHaveLength(10);
    expect(res.body.data.recoveryCodes).not.toEqual(oldCodes);
    expect(JSON.stringify(res.body)).not.toMatch(/\$argon2|code_hash/);

    const newLogin = await login('frank_06', 'N3w-Passphrase!');
    expect(newLogin.status).toBe(200);

    const oldLogin = await login('frank_06', 'Str0ng-Passphrase');
    expect(oldLogin.status).toBe(401);
  });

  it('同一个恢复码只能用一次', async () => {
    const registered = await registerUser(app, 'gina_07');
    const code = registered.recoveryCodes[0]!;

    const first = await recover('gina_07', code, 'An0ther-Passphrase!');
    expect(first.status).toBe(200);

    const second = await recover('gina_07', code, 'Th1rd-Passphrase!');
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('AUTH_RECOVERY_CODE_INVALID');
  });

  it('恢复码大小写与连字符不影响识别', async () => {
    const registered = await registerUser(app, 'hank_08');
    const messy = ` ${registered.recoveryCodes[1]!.toLowerCase()} `;
    const res = await recover('hank_08', messy, 'N3w-Passphrase!');
    expect(res.status).toBe(200);
  });

  it('无效恢复码与不存在的用户返回同一错误码，避免枚举账号', async () => {
    await registerUser(app, 'iris_09');
    const existingUser = await recover('iris_09', 'ZZZZ-ZZZZ-ZZZZ', 'N3w-Passphrase!');
    const unknownUser = await recover('nobody_10', 'ZZZZ-ZZZZ-ZZZZ', 'N3w-Passphrase!');
    expect(existingUser.status).toBe(400);
    expect(unknownUser.status).toBe(400);
    expect(existingUser.body.error.code).toBe('AUTH_RECOVERY_CODE_INVALID');
    expect(unknownUser.body.error.code).toBe('AUTH_RECOVERY_CODE_INVALID');
  });

  it('使用恢复码后撤销该用户全部会话', async () => {
    const registered = await registerUser(app, 'jack_11');
    const session = await loginUser(app, 'jack_11');
    await loginUser(app, 'jack_11');

    const res = await recover('jack_11', registered.recoveryCodes[0]!, 'N3w-Passphrase!');
    expect(res.status).toBe(200);

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: session.refreshToken });
    expect(refreshed.status).toBe(401);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('authorization', `Bearer ${session.accessToken}`);
    expect(me.status).toBe(401);
  });

  it('弱新密码被拒绝且不消耗恢复码', async () => {
    const registered = await registerUser(app, 'kate_12');
    const code = registered.recoveryCodes[0]!;

    const weak = await recover('kate_12', code, 'password1234');
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_FAILED');

    const retry = await recover('kate_12', code, 'N3w-Passphrase!');
    expect(retry.status).toBe(200);
  });

  it('恢复成功写入审计且不含秘密', async () => {
    const registered = await registerUser(app, 'liam_13');
    await recover('liam_13', registered.recoveryCodes[0]!, 'N3w-Passphrase!');

    const rows = db.sqlite
      .prepare("SELECT metadata_json FROM audit_logs WHERE action = 'auth.recovery.succeeded'")
      .all() as Array<{ metadata_json: string | null }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toMatch(/N3w-Passphrase|\$argon2|ZZZZ/);
  });

  it('所有旧恢复码在重置后失效（整组作废）', async () => {
    const registered = await registerUser(app, 'mona_14');
    await recover('mona_14', registered.recoveryCodes[0]!, 'N3w-Passphrase!');

    const withOldCode = await recover('mona_14', registered.recoveryCodes[1]!, 'Th1rd-Passphrase!');
    expect(withOldCode.status).toBe(400);
    expect(withOldCode.body.error.code).toBe('AUTH_RECOVERY_CODE_INVALID');
  });
});
