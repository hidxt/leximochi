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

function seedWords(db: DatabaseService): void {
  const now = Date.now();
  const run = (sql: string, params: unknown[] = []) => db.sqlite.prepare(sql).run(...(params as never[]));
  run(
    `INSERT INTO wordbooks (id, key, name, language, is_system, version, word_count, created_at, updated_at)
     VALUES ('wb1', 'cet4', '四级核心词', 'en', 1, 1, 2, ?, ?)`,
    [now, now],
  );
  run(
    `INSERT INTO words (id, headword, headword_canonical, source, created_at, updated_at)
     VALUES ('w-abandon', 'abandon', 'abandon', 'imported', ?, ?)`,
    [now, now],
  );
  run(
    `INSERT INTO words (id, headword, headword_canonical, source, created_at, updated_at)
     VALUES ('w-abruptly', 'abruptly', 'abruptly', 'imported', ?, ?)`,
    [now, now],
  );
  run(`INSERT INTO wordbook_entries (wordbook_id, word_id, rank, tags_json) VALUES ('wb1','w-abandon',1,NULL)`);
  run(`INSERT INTO wordbook_entries (wordbook_id, word_id, rank, tags_json) VALUES ('wb1','w-abruptly',2,NULL)`);
  run(
    `INSERT INTO word_senses (id, word_id, part_of_speech, definition_zh, sort_order)
     VALUES ('s1', 'w-abandon', 'v.', '放弃；抛弃', 0)`,
  );
  run(
    `INSERT INTO word_senses (id, word_id, part_of_speech, definition_zh, sort_order)
     VALUES ('s2', 'w-abruptly', 'adv', '突然地', 0)`,
  );
}

describe('拼写/听写：错拼惩罚与错拼清单', () => {
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
    await registerUser(app, 'speller_a');
    await registerUser(app, 'speller_b');
    tokenA = (await loginUser(app, 'speller_a')).accessToken;
    tokenB = (await loginUser(app, 'speller_b')).accessToken;
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  const evt = (n: number) => `spell-event-${String(n).padStart(4, '0')}`;

  const submit = (body: Record<string, unknown>, bearer = tokenA) =>
    request(app.getHttpServer())
      .post('/review/submit')
      .set({ authorization: `Bearer ${bearer}` })
      .send(body);

  const listErrors = (bearer = tokenA, query = '') =>
    request(app.getHttpServer())
      .get(`/review/spelling-errors${query}`)
      .set({ authorization: `Bearer ${bearer}` });

  it('拼写答错：在「答错」惩罚之外按错拼类型追加难度惩罚', async () => {
    const spelled = await submit({
      eventId: evt(1),
      wordId: 'w-abruptly',
      questionType: 'spelling',
      answer: 'aburptly',
      durationMs: 5000,
    });
    expect(spelled.status).toBe(200);
    expect(spelled.body.data.correct).toBe(false);
    expect(spelled.body.data.rating).toBe('again');
    expect(spelled.body.data.spellingErrors).toEqual(['order_error']);
    // 2.5（初始）- 0.2（答错）- 0.1（顺序错误）= 2.2
    expect(spelled.body.data.state.easeFactor).toBeCloseTo(2.2, 4);

    const choice = await submit({
      eventId: evt(2),
      wordId: 'w-abandon',
      questionType: 'definition_choice',
      answer: '这不是释义',
      durationMs: 5000,
    });
    expect(choice.status).toBe(200);
    expect(choice.body.data.spellingErrors).toEqual([]);
    // 非拼写题型只有「答错」惩罚：2.5 - 0.2 = 2.3（与上面的 2.2 对比即可证明追加了错拼惩罚）
    expect(choice.body.data.state.easeFactor).toBeCloseTo(2.3, 4);
  });

  it('听写答错同样记录错拼分类并追加惩罚', async () => {
    const res = await submit({
      eventId: evt(3),
      wordId: 'w-abandon',
      questionType: 'listening_dictation',
      answer: 'abandom',
      durationMs: 4000,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.correct).toBe(false);
    expect(res.body.data.spellingErrors).toEqual(['wrong_letter']);
    // 上一次已是 2.3：2.3 - 0.2（答错）- 0.03（错字母）= 2.07
    expect(res.body.data.state.easeFactor).toBeCloseTo(2.07, 4);
  });

  it('错拼清单按词聚合分类与次数，且只包含本人数据', async () => {
    const mine = await listErrors();
    expect(mine.status).toBe(200);
    expect(mine.body.data.total).toBe(2);

    const abruptly = mine.body.data.items.find(
      (item: { wordId: string }) => item.wordId === 'w-abruptly',
    );
    expect(abruptly).toMatchObject({
      headword: 'abruptly',
      lastActual: 'aburptly',
      totalCount: 1,
    });
    expect(abruptly.errorCounts.order_error).toBe(1);
    expect(abruptly.errorCounts.missing_letter).toBe(0);
    expect(abruptly.firstAt).toBeGreaterThan(0);
    expect(abruptly.lastAt).toBeGreaterThanOrEqual(abruptly.firstAt);

    // 另一个用户没有任何错拼记录：数据严格隔离（IDOR 防护）
    const other = await listErrors(tokenB);
    expect(other.status).toBe(200);
    expect(other.body.data).toEqual({ items: [], total: 0 });
  });

  it('同一词多次错拼累计计数，并保留最近一次的错误输入', async () => {
    await submit(
      {
        eventId: evt(4),
        wordId: 'w-abruptly',
        questionType: 'spelling',
        answer: 'aburptly',
        durationMs: 4000,
      },
      tokenB,
    );
    const second = await submit(
      {
        eventId: evt(5),
        wordId: 'w-abruptly',
        questionType: 'spelling',
        answer: 'abruptl',
        durationMs: 4000,
      },
      tokenB,
    );
    expect(second.body.data.spellingErrors).toEqual(['missing_letter']);

    const res = await listErrors(tokenB);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items).toHaveLength(1);
    const item = res.body.data.items[0];
    expect(item.wordId).toBe('w-abruptly');
    expect(item.totalCount).toBe(2);
    expect(item.errorCounts.order_error).toBe(1);
    expect(item.errorCounts.missing_letter).toBe(1);
    expect(item.lastActual).toBe('abruptl');
    // 错拼次数之和等于总次数，未涉及的分类为 0
    expect(item.errorCounts.wrong_letter + item.errorCounts.duplicate_letter).toBe(0);
  });

  it('答对不会进入错拼清单', async () => {
    const ok = await submit(
      {
        eventId: evt(6),
        wordId: 'w-abandon',
        questionType: 'spelling',
        answer: 'abandon',
        durationMs: 3000,
      },
      tokenB,
    );
    expect(ok.body.data.correct).toBe(true);
    expect(ok.body.data.spellingErrors).toEqual([]);

    const res = await listErrors(tokenB);
    expect(res.body.data.total).toBe(1);
    expect(
      res.body.data.items.some((item: { wordId: string }) => item.wordId === 'w-abandon'),
    ).toBe(false);
  });

  it('未登录返回 401；非法 limit 被 DTO 拒绝', async () => {
    await request(app.getHttpServer()).get('/review/spelling-errors').expect(401);
    expect((await listErrors(tokenA, '?limit=0')).status).toBe(400);
    expect((await listErrors(tokenA, '?limit=999')).status).toBe(400);
    const limited = await listErrors(tokenA, '?limit=1');
    expect(limited.status).toBe(200);
    expect(limited.body.data.items).toHaveLength(1);
    // total 表示错拼过的词条总数，不受 limit 影响
    expect(limited.body.data.total).toBe(2);
  });
});
