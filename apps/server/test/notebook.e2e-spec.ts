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
import { loginUser, registerUser } from './helpers/factories';

const MIGRATIONS = `${__dirname}/../drizzle`;

const WORDS = [
  { id: 'w-abandon', headword: 'abandon', definition: '放弃；抛弃' },
  { id: 'w-abruptly', headword: 'abruptly', definition: '突然地' },
  { id: 'w-brief', headword: 'brief', definition: '简短的' },
  { id: 'w-cautious', headword: 'cautious', definition: '谨慎的' },
] as const;

function seedWords(db: DatabaseService): void {
  const now = Date.now();
  const run = (sql: string, params: unknown[] = []) => db.sqlite.prepare(sql).run(...(params as never[]));
  run(
    `INSERT INTO wordbooks (id, key, name, language, is_system, version, word_count, created_at, updated_at)
     VALUES ('wb1', 'cet4', '四级核心词', 'en', 1, 1, ?, ?, ?)`,
    [WORDS.length, now, now],
  );
  WORDS.forEach((word, index) => {
    run(
      `INSERT INTO words (id, headword, headword_canonical, source, created_at, updated_at)
       VALUES (?, ?, ?, 'imported', ?, ?)`,
      [word.id, word.headword, word.headword, now, now],
    );
    run(`INSERT INTO wordbook_entries (wordbook_id, word_id, rank, tags_json) VALUES ('wb1', ?, ?, NULL)`, [
      word.id,
      index + 1,
    ]);
    run(
      `INSERT INTO word_senses (id, word_id, part_of_speech, definition_zh, sort_order)
       VALUES (?, ?, 'v.', ?, 0)`,
      [`sense-${word.id}`, word.id, word.definition],
    );
  });
}

describe('生词本 /notebook', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    db = createDatabase(':memory:');
    runMigrations(db, MIGRATIONS);
    seedSystemRoles(db);
    seedWords(db);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('CONFIG')
      .useValue(buildTestEnv())
      .overrideProvider(DATABASE)
      .useValue(db)
      .compile();
    app = await buildTestApp(moduleRef);
    await registerUser(app, 'notebook_a');
    await registerUser(app, 'notebook_b');
    tokenA = (await loginUser(app, 'notebook_a')).accessToken;
    tokenB = (await loginUser(app, 'notebook_b')).accessToken;
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  const url = (path = '') => `/notebook${path}`;

  const get = (bearer = tokenA, path = '', query = '') =>
    request(app.getHttpServer())
      .get(`${url(path)}${query}`)
      .set({ authorization: `Bearer ${bearer}` });

  const post = (body: Record<string, unknown>, bearer = tokenA) =>
    request(app.getHttpServer())
      .post(url())
      .set({ authorization: `Bearer ${bearer}` })
      .send(body);

  const del = (wordId: string, bearer = tokenA) =>
    request(app.getHttpServer())
      .delete(url(`/${wordId}`))
      .set({ authorization: `Bearer ${bearer}` });

  const rowCount = (wordId: string, username: string) =>
    (
      db.sqlite
        .prepare(
          `SELECT COUNT(*) AS c FROM user_notebook n
           JOIN users u ON u.id = n.user_id
           WHERE n.word_id = ? AND u.username_canonical = ?`,
        )
        .get(wordId, username) as { c: number }
    ).c;

  it('未登录访问一律 401', async () => {
    await request(app.getHttpServer()).get(url()).expect(401);
    await request(app.getHttpServer()).post(url()).send({ wordId: 'w-abandon' }).expect(401);
    await request(app.getHttpServer()).delete(url('/w-abandon')).expect(401);
  });

  it('加入生词本返回词条信息并标记 created=true', async () => {
    const res = await post({ wordId: 'w-abandon', note: '总是记不住' });
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(true);
    expect(res.body.data.entry).toMatchObject({
      wordId: 'w-abandon',
      headword: 'abandon',
      definitionZh: '放弃；抛弃',
      note: '总是记不住',
      source: 'manual',
    });
    expect(res.body.data.entry.addedAt).toBeGreaterThan(0);
    expect(rowCount('w-abandon', 'notebook_a')).toBe(1);
  });

  it('重复加入幂等：不新增行、不覆盖原有备注，created=false', async () => {
    const res = await post({ wordId: 'w-abandon', note: '换个备注' });
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(false);
    expect(res.body.data.entry.note).toBe('总是记不住');
    expect(rowCount('w-abandon', 'notebook_a')).toBe(1);
  });

  it('加入不存在的词条返回 404 WORD_NOT_FOUND', async () => {
    const res = await post({ wordId: 'w-not-exists' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('WORD_NOT_FOUND');
    expect(rowCount('w-not-exists', 'notebook_a')).toBe(0);
  });

  it('来源只允许白名单取值，未知字段被拒绝', async () => {
    const badSource = await post({ wordId: 'w-brief', source: 'hacked' });
    expect(badSource.status).toBe(400);

    const extraField = await post({ wordId: 'w-brief', addedAt: 1, userId: 'someone-else' });
    expect(extraField.status).toBe(400);

    const tooLongNote = await post({ wordId: 'w-brief', note: 'x'.repeat(201) });
    expect(tooLongNote.status).toBe(400);
  });

  it('列表只返回本人条目，不泄露他人数据', async () => {
    await post({ wordId: 'w-abruptly', source: 'from_review' }, tokenB);

    const mine = await get();
    expect(mine.status).toBe(200);
    expect(mine.body.data.items.map((item: { wordId: string }) => item.wordId)).toEqual(['w-abandon']);
    expect(mine.body.data.nextCursor).toBeNull();

    const other = await get(tokenB);
    expect(other.body.data.items.map((item: { wordId: string }) => item.wordId)).toEqual(['w-abruptly']);
    expect(other.body.data.items[0].source).toBe('from_review');
  });

  it('分页游标可连续翻页且不重不漏', async () => {
    await post({ wordId: 'w-brief' });
    await post({ wordId: 'w-cautious' });

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const query: string = cursor ? `?limit=1&cursor=${encodeURIComponent(cursor)}` : '?limit=1';
      const res: request.Response = await get(tokenA, '', query);
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeLessThanOrEqual(1);
      seen.push(...res.body.data.items.map((item: { wordId: string }) => item.wordId));
      cursor = res.body.data.nextCursor as string | null;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.sort()).toEqual(['w-abandon', 'w-brief', 'w-cautious']);
  });

  it('非法游标被拒绝（400），不静默回退到首页', async () => {
    const res = await get(tokenA, '', '?cursor=not-a-cursor!!!');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('删除自己的条目成功；重复删除返回 404', async () => {
    const removed = await del('w-abruptly', tokenB);
    expect(removed.status).toBe(200);
    expect(removed.body.data.removed).toBe(true);
    expect(rowCount('w-abruptly', 'notebook_b')).toBe(0);

    const again = await del('w-abruptly', tokenB);
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('NOTEBOOK_ENTRY_NOT_FOUND');
  });

  it('越权：不能删除他人条目（404 且他人数据不变）', async () => {
    const res = await del('w-abandon', tokenB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOTEBOOK_ENTRY_NOT_FOUND');
    expect(rowCount('w-abandon', 'notebook_a')).toBe(1);
  });
});
