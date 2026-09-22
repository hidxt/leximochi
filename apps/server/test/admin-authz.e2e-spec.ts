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
import { createAdminAndLogin, registerAndLogin } from './helpers/factories';

const MIGRATIONS = `${__dirname}/../drizzle`;

describe('后台权限隔离（RBAC）', () => {
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

  it('普通用户访问任何 /admin 接口返回 403', async () => {
    const user = await registerAndLogin(app, 'nina_30');
    const calls = [
      () => request(app.getHttpServer()).get('/admin/users').set(auth(user.accessToken)),
      () => request(app.getHttpServer()).get('/admin/audit-logs').set(auth(user.accessToken)),
      () =>
        request(app.getHttpServer())
          .post(`/admin/users/${user.userId}/ban`)
          .set(auth(user.accessToken))
          .send({ reason: 'x' }),
      () =>
        request(app.getHttpServer())
          .post(`/admin/users/${user.userId}/unban`)
          .set(auth(user.accessToken))
          .send({}),
    ];
    for (const call of calls) {
      const res = await call();
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('未认证访问 /admin 返回 401', async () => {
    const res = await request(app.getHttpServer()).get('/admin/users');
    expect(res.status).toBe(401);
  });

  it('管理员可以访问用户列表', async () => {
    const admin = await createAdminAndLogin(app, db, 'admin_a');
    const res = await request(app.getHttpServer())
      .get('/admin/users')
      .set(auth(admin.accessToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('降权后立即失效（权限每请求从数据库读取）', async () => {
    const admin = await createAdminAndLogin(app, db, 'temp_admin');
    const allowed = await request(app.getHttpServer())
      .get('/admin/users')
      .set(auth(admin.accessToken));
    expect(allowed.status).toBe(200);

    db.sqlite
      .prepare(
        `DELETE FROM user_roles
         WHERE user_id = ? AND role_id = (SELECT id FROM roles WHERE key = 'admin')`,
      )
      .run(admin.userId);

    const denied = await request(app.getHttpServer())
      .get('/admin/users')
      .set(auth(admin.accessToken));
    expect(denied.status).toBe(403);
  });

  it('封禁普通用户后其现有 access token 立即失效', async () => {
    const admin = await createAdminAndLogin(app, db, 'admin_b');
    const victim = await registerAndLogin(app, 'victim_31');

    const banned = await request(app.getHttpServer())
      .post(`/admin/users/${victim.userId}/ban`)
      .set(auth(admin.accessToken))
      .send({ reason: '违规' });
    expect(banned.status).toBe(200);

    // 封禁会撤销全部会话，旧 access token 随之失效
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set(auth(victim.accessToken));
    expect(me.status).toBe(401);
  });
});
