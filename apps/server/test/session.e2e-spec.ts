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
import { loginUser, registerAndLogin, registerUser } from './helpers/factories';

const MIGRATIONS = `${__dirname}/../drizzle`;

describe('设备会话管理', () => {
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

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  it('列出当前账号的活跃会话并标记当前会话', async () => {
    await registerUser(app, 'mia_20');
    const first = await loginUser(app, 'mia_20');
    await loginUser(app, 'mia_20');

    const res = await request(app.getHttpServer()).get('/auth/sessions').set(auth(first.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.filter((s: { isCurrent: boolean }) => s.isCurrent)).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/refreshTokenHash|passwordHash/);
  });

  it('删除自己的会话后该会话失效且不再出现在列表', async () => {
    await registerUser(app, 'noah_21');
    const first = await loginUser(app, 'noah_21');
    const second = await loginUser(app, 'noah_21');

    const list = await request(app.getHttpServer()).get('/auth/sessions').set(auth(second.accessToken));
    const other = list.body.data.find((s: { isCurrent: boolean }) => !s.isCurrent);
    expect(other).toBeDefined();

    const deleted = await request(app.getHttpServer())
      .delete(`/auth/sessions/${other.id}`)
      .set(auth(second.accessToken));
    expect(deleted.status).toBe(200);

    const after = await request(app.getHttpServer()).get('/auth/sessions').set(auth(second.accessToken));
    expect(after.body.data).toHaveLength(1);

    const revokedRefresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: first.refreshToken });
    expect(revokedRefresh.status).toBe(401);
  });

  it('无法删除他人的会话（IDOR 防护，返回 404）', async () => {
    await registerUser(app, 'olga_22');
    await registerUser(app, 'pete_23');
    const victim = await loginUser(app, 'olga_22');
    const attacker = await loginUser(app, 'pete_23');

    const victimList = await request(app.getHttpServer())
      .get('/auth/sessions')
      .set(auth(victim.accessToken));
    const victimSessionId = victimList.body.data[0].id as string;

    const res = await request(app.getHttpServer())
      .delete(`/auth/sessions/${victimSessionId}`)
      .set(auth(attacker.accessToken));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('AUTH_SESSION_NOT_FOUND');

    // 受害者会话仍然有效
    const stillValid = await request(app.getHttpServer())
      .get('/auth/me')
      .set(auth(victim.accessToken));
    expect(stillValid.status).toBe(200);
  });

  it('退出全部设备后所有会话失效', async () => {
    const session = await registerAndLogin(app, 'quinn_24');
    await loginUser(app, 'quinn_24');
    await loginUser(app, 'quinn_24');

    const res = await request(app.getHttpServer())
      .post('/auth/logout-all')
      .set(auth(session.accessToken));
    expect(res.status).toBe(200);

    const list = await request(app.getHttpServer())
      .get('/auth/sessions')
      .set(auth(session.accessToken));
    expect(list.status).toBe(401);

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: session.refreshToken });
    expect(refreshed.status).toBe(401);
  });
});
