import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, type DatabaseService } from '../src/database/database.service';
import { runMigrations } from '../src/database/migrate';
import { seedSystemRoles } from '../src/database/seed/roles.seed';

const MIGRATIONS = join(__dirname, '..', 'drizzle');

describe('数据库层', () => {
  let dir: string;
  let db: DatabaseService;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'leximochi-db-'));
    db = createDatabase(join(dir, 'test.sqlite'));
    runMigrations(db, MIGRATIONS);
    seedSystemRoles(db);
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('启用 WAL、busy_timeout 与外键', () => {
    expect(String(db.pragma('journal_mode')).toLowerCase()).toBe('wal');
    expect(Number(db.pragma('busy_timeout'))).toBe(5000);
    expect(Number(db.pragma('foreign_keys'))).toBe(1);
  });

  it('migration 创建全部 Phase 1 表', () => {
    const rows = db.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = rows.map((r) => r.name);
    for (const table of [
      'users',
      'roles',
      'permissions',
      'role_permissions',
      'user_roles',
      'sessions',
      'recovery_codes',
      'auth_attempts',
      'captcha_challenges',
      'audit_logs',
    ]) {
      expect(names).toContain(table);
    }
  });

  it('migration 与种子数据可重复执行', () => {
    runMigrations(db, MIGRATIONS);
    seedSystemRoles(db);

    const roles = db.sqlite.prepare('SELECT key FROM roles ORDER BY key').all() as Array<{
      key: string;
    }>;
    expect(roles.map((r) => r.key)).toEqual(['admin', 'user']);

    const perms = db.sqlite
      .prepare('SELECT key FROM permissions ORDER BY key')
      .all() as Array<{ key: string }>;
    expect(perms.map((p) => p.key)).toEqual([
      'admin.audit.read',
      'admin.users.ban',
      'admin.users.read',
    ]);

    const links = db.sqlite
      .prepare(
        `SELECT COUNT(*) AS c FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id WHERE r.key = 'admin'`,
      )
      .get() as { c: number };
    expect(links.c).toBe(3);
  });

  it('外键约束生效：插入不存在用户的会话被拒绝', () => {
    expect(() =>
      db.sqlite
        .prepare(
          `INSERT INTO sessions (id, user_id, family_id, refresh_token_hash, expires_at, created_at)
           VALUES ('s1', 'missing-user', 'f1', 'h1', 1, 1)`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/i);
  });

  it('username_canonical 唯一约束生效', () => {
    const now = Date.now();
    const insert = db.sqlite.prepare(
      `INSERT INTO users (id, username, username_canonical, password_hash, password_algo,
         password_updated_at, status, created_at, updated_at)
       VALUES (?, ?, ?, 'hash', 'argon2id', ?, 'active', ?, ?)`,
    );
    insert.run('u1', 'Alice', 'alice', now, now, now);
    expect(() => insert.run('u2', 'alice', 'alice', now, now, now)).toThrow(/UNIQUE/i);
  });
});
