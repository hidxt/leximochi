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
const DAY_MS = 24 * 60 * 60 * 1000;

const WORDS = [
  { id: 'w-abandon', headword: 'abandon', definition: '放弃；抛弃' },
  { id: 'w-abruptly', headword: 'abruptly', definition: '突然地' },
  { id: 'w-brief', headword: 'brief', definition: '简短的' },
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('学习历史与统计 /review/history、/review/stats', () => {
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
    await registerUser(app, 'insight_a');
    await registerUser(app, 'insight_b');
    tokenA = (await loginUser(app, 'insight_a')).accessToken;
    tokenB = (await loginUser(app, 'insight_b')).accessToken;

    // 制造学习数据：先答对一题，再答错一题（时间戳不同，便于验证倒序）
    await submit(tokenA, {
      eventId: 'insight-event-0001',
      wordId: 'w-abandon',
      questionType: 'spelling',
      answer: 'abandon',
      durationMs: 1200,
    });
    await sleep(5);
    await submit(tokenA, {
      eventId: 'insight-event-0002',
      wordId: 'w-abruptly',
      questionType: 'spelling',
      answer: 'aburptly',
      durationMs: 6000,
    });
    await sleep(5);
    // 加入生词本一个词，用于统计中的生词本数量
    await request(app.getHttpServer())
      .post('/notebook')
      .set({ authorization: `Bearer ${tokenA}` })
      .send({ wordId: 'w-brief' });
    // 另一个用户的数据，用于验证隔离
    await submit(tokenB, {
      eventId: 'insight-event-0003',
      wordId: 'w-brief',
      questionType: 'spelling',
      answer: 'brief',
      durationMs: 1000,
    });
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  function submit(bearer: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/review/submit')
      .set({ authorization: `Bearer ${bearer}` })
      .send(body);
  }

  const history = (bearer = tokenA, query = '') =>
    request(app.getHttpServer())
      .get(`/review/history${query}`)
      .set({ authorization: `Bearer ${bearer}` });

  const stats = (bearer = tokenA) =>
    request(app.getHttpServer())
      .get('/review/stats')
      .set({ authorization: `Bearer ${bearer}` });

  it('未登录访问历史与统计返回 401', async () => {
    await request(app.getHttpServer()).get('/review/history').expect(401);
    await request(app.getHttpServer()).get('/review/stats').expect(401);
  });

  it('历史按答题时间倒序返回，且含词形与判定结果', async () => {
    const res = await history();
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    const [latest, earlier] = res.body.data.items;
    expect(latest).toMatchObject({
      wordId: 'w-abruptly',
      headword: 'abruptly',
      questionType: 'spelling',
      isCorrect: false,
      rating: 'again',
      durationMs: 6000,
    });
    expect(earlier).toMatchObject({ wordId: 'w-abandon', headword: 'abandon', isCorrect: true });
    expect(latest.answeredAt).toBeGreaterThanOrEqual(earlier.answeredAt);
    expect(res.body.data.nextCursor).toBeNull();
  });

  it('历史分页游标可连续翻页且不重不漏；非法游标 400', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 4; page += 1) {
      const query: string = cursor ? `?limit=1&cursor=${encodeURIComponent(cursor)}` : '?limit=1';
      const res: request.Response = await history(tokenA, query);
      expect(res.status).toBe(200);
      seen.push(...res.body.data.items.map((item: { wordId: string }) => item.wordId));
      cursor = res.body.data.nextCursor as string | null;
      if (!cursor) break;
    }
    expect(seen).toEqual(['w-abruptly', 'w-abandon']);

    const bad = await history(tokenA, '?cursor=not-a-cursor!!!');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');

    expect((await history(tokenA, '?limit=0')).status).toBe(400);
    expect((await history(tokenA, '?limit=999')).status).toBe(400);
  });

  it('历史数据按用户隔离', async () => {
    const mine = await history(tokenA);
    const other = await history(tokenB);
    expect(other.status).toBe(200);
    expect(other.body.data.items.map((item: { wordId: string }) => item.wordId)).toEqual(['w-brief']);
    expect(mine.body.data.items.map((item: { wordId: string }) => item.wordId)).not.toContain('w-brief');
  });

  it('统计：今日量、正确率、平均用时、生词本数量与近 7 日趋势', async () => {
    const res = await stats();
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.learnedToday).toBe(2);
    // 两个词都是今天首次学习，不算「复习」
    expect(data.reviewedToday).toBe(0);
    expect(data.correctToday).toBe(1);
    expect(data.accuracyToday).toBe(0.5);
    expect(data.averageDurationMsToday).toBe(3600);
    expect(data.learningWords).toBe(2);
    expect(data.masteredWords).toBe(0);
    expect(data.notebookCount).toBe(1);

    expect(data.dailyTrend).toHaveLength(7);
    const today = new Date().toISOString().slice(0, 10);
    expect(data.dailyTrend[6].date).toBe(today);
    expect(data.dailyTrend[6].newWords).toBe(2);
    expect(data.dailyTrend[6].reviews).toBe(0);
    // 趋势按时间升序，且相邻日期恰好相差一天
    const dates = data.dailyTrend.map((point: { date: string }) => point.date);
    expect(dates).toEqual([...dates].sort());
    expect(new Date(`${dates[6]}T00:00:00.000Z`).getTime() - new Date(`${dates[0]}T00:00:00.000Z`).getTime()).toBe(
      6 * DAY_MS,
    );
  });

  it('已掌握词数按学习状态统计（服务端数据为准）', async () => {
    db.sqlite
      .prepare("UPDATE user_word_states SET status = 'mastered' WHERE word_id = 'w-abandon'")
      .run();
    const res = await stats();
    expect(res.body.data.masteredWords).toBe(1);
    expect(res.body.data.learningWords).toBe(1);
  });

  it('无作答记录的用户：正确率与平均用时为 null，趋势全 0', async () => {
    await registerUser(app, 'insight_c');
    const tokenC = (await loginUser(app, 'insight_c')).accessToken;
    const res = await stats(tokenC);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      learnedToday: 0,
      reviewedToday: 0,
      correctToday: 0,
      accuracyToday: null,
      averageDurationMsToday: null,
      masteredWords: 0,
      learningWords: 0,
      notebookCount: 0,
    });
    expect(res.body.data.dailyTrend).toHaveLength(7);
    expect(
      res.body.data.dailyTrend.every(
        (point: { newWords: number; reviews: number }) => point.newWords === 0 && point.reviews === 0,
      ),
    ).toBe(true);
  });
});
