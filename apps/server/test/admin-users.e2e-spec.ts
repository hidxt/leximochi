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
import { createAdminAndLogin, registerAndLogin, registerUser } from './helpers/factories';

const MIGRATIONS = `${__dirname}/../drizzle`;

describe('后台用户管理', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let admin: { accessToken: string; userId: string };

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
    admin = await createAdminAndLogin(app, db, 'admin_main');
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  const auth = () => ({ authorization: `Bearer ${admin.accessToken}` });

  it('用户检索返回匹配结果且不含任何凭证字段', async () => {
    await registerUser(app, 'olive_40');
    const res = await request(app.getHttpServer())
      .get('/admin/users?query=olive_40')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].username).toBe('olive_40');
    expect(res.body.data.items[0].roles).toEqual(['user']);
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|passwordHash|\$argon2|refresh_token/);
  });

  it('检索中的 LIKE 通配符被转义（不会匹配全部用户）', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/users?query=%25')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  it('分页游标可用且不会重复返回同一用户', async () => {
    const first = await request(app.getHttpServer())
      .get('/admin/users?limit=1')
      .set(auth());
    expect(first.status).toBe(200);
    expect(first.body.data.items).toHaveLength(1);

    const cursor = first.body.data.nextCursor as string | null;
    if (cursor) {
      const second = await request(app.getHttpServer())
        .get(`/admin/users?limit=1&cursor=${encodeURIComponent(cursor)}`)
        .set(auth());
      expect(second.status).toBe(200);
      expect(second.body.data.items[0].id).not.toBe(first.body.data.items[0].id);
    }
  });

  it('封禁用户后其会话被撤销、无法登录，并写入管理员审计', async () => {
    const victim = await registerAndLogin(app, 'peter_41');

    const banned = await request(app.getHttpServer())
      .post(`/admin/users/${victim.userId}/ban`)
      .set(auth())
      .send({ reason: '违规测试' });
    expect(banned.status).toBe(200);

    // 封禁同时撤销了全部会话，因此旧 access token 已失效（401 而非 403）
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set({ authorization: `Bearer ${victim.accessToken}` });
    expect(me.status).toBe(401);

    const relogin = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username: 'peter_41', password: 'Str0ng-Passphrase' });
    expect(relogin.status).toBe(403);
    expect(relogin.body.error.code).toBe('AUTH_ACCOUNT_BANNED');

    const audit = db.sqlite
      .prepare(
        "SELECT actor_user_id FROM audit_logs WHERE action = 'admin.user.banned' AND target_id = ?",
      )
      .all(victim.userId) as Array<{ actor_user_id: string | null }>;
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor_user_id).toBe(admin.userId);
  });

  it('解封后可重新登录，但需重新建立会话', async () => {
    const victim = await registerAndLogin(app, 'quinn_42');
    await request(app.getHttpServer())
      .post(`/admin/users/${victim.userId}/ban`)
      .set(auth())
      .send({ reason: '测试' });

    const unban = await request(app.getHttpServer())
      .post(`/admin/users/${victim.userId}/unban`)
      .set(auth())
      .send({});
    expect(unban.status).toBe(200);

    const relogin = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username: 'quinn_42', password: 'Str0ng-Passphrase' });
    expect(relogin.status).toBe(200);
  });

  it('不能封禁自己；封禁不存在的用户返回 404', async () => {
    const selfBan = await request(app.getHttpServer())
      .post(`/admin/users/${admin.userId}/ban`)
      .set(auth())
      .send({ reason: '自封测试' });
    expect(selfBan.status).toBe(400);

    const missing = await request(app.getHttpServer())
      .post('/admin/users/00000000-0000-4000-8000-000000000000/ban')
      .set(auth())
      .send({ reason: '用户不存在' });
    expect(missing.status).toBe(404);
  });

  it('封禁原因缺失或过短时被 DTO 拒绝', async () => {
    const victim = await registerUser(app, 'rita_43');
    const res = await request(app.getHttpServer())
      .post(`/admin/users/${victim.user.id}/ban`)
      .set(auth())
      .send({ reason: 'x' });
    expect(res.status).toBe(400);
  });

  it('审计日志可按动作过滤且不包含秘密', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/audit-logs?action=admin.user.banned&limit=10')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toMatch(/\$argon2|Bearer |password_hash|Str0ng/);
  });
});
