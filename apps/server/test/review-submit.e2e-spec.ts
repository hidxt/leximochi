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
const MINUTE = 60 * 1000;

function seedWords(db: DatabaseService): void {
  const now = Date.now();
  const run = (sql: string, params: unknown[] = []) => db.sqlite.prepare(sql).run(...(params as never[]));
  run(
    `INSERT INTO wordbooks (id, key, name, language, is_system, version, word_count, created_at, updated_at)
     VALUES ('wb1', 'cet4', '四级核心词', 'en', 1, 1, 2, ?, ?)`,
    [now, now],
  );
  run(
    `INSERT INTO words (id, headword, headword_canonical, phonetic_uk, phonetic_us, source, created_at, updated_at)
     VALUES ('w-abandon', 'abandon', 'abandon', '/əˈbændən/', '/əˈbændən/', 'imported', ?, ?)`,
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
     VALUES ('s2', 'w-abandon', 'n.', '放纵', 1)`,
  );
  run(
    `INSERT INTO word_senses (id, word_id, part_of_speech, definition_zh, sort_order)
     VALUES ('s3', 'w-abruptly', 'adv', '突然地', 0)`,
  );
}

describe('POST /review/submit（SM-2 落库与幂等）', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let token: string;
  let secondToken: string;

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
    await registerUser(app, 'learner_a');
    await registerUser(app, 'learner_b');
    token = (await loginUser(app, 'learner_a')).accessToken;
    secondToken = (await loginUser(app, 'learner_b')).accessToken;
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  /** 幂等键长度需 ≥8（真实场景为 UUID），这里统一生成 */
  const evt = (n: number) => `test-event-${String(n).padStart(4, '0')}`;

  const submit = (body: Record<string, unknown>, bearer = token) =>
    request(app.getHttpServer())
      .post('/review/submit')
      .set({ authorization: `Bearer ${bearer}` })
      .send(body);

  const stateOf = (userId: string, wordId: string) =>
    db.sqlite
      .prepare('SELECT * FROM user_word_states WHERE user_id = ? AND word_id = ?')
      .get(userId, wordId) as Record<string, unknown> | undefined;

  const userIdOf = (username: string) =>
    (db.sqlite.prepare('SELECT id FROM users WHERE username_canonical = ?').get(username) as { id: string }).id;

  it('未登录返回 401', async () => {
    await request(app.getHttpServer())
      .post('/review/submit')
      .send({ eventId: evt(99), wordId: 'w-abruptly', questionType: 'spelling', answer: 'abruptly', durationMs: 1000 })
      .expect(401);
  });

  it('首次答对：写入状态与复习记录，返回服务端判定的评分', async () => {
    const res = await submit({
      eventId: evt(1),
      wordId: 'w-abandon',
      questionType: 'spelling',
      answer: 'Abandon',
      durationMs: 4000,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.correct).toBe(true);
    expect(res.body.data.correctAnswer).toBe('abandon');
    expect(res.body.data.rating).toBe('good');
    expect(res.body.data.state.totalReviews).toBe(1);
    expect(res.body.data.state.repetitions).toBe(1);
    expect(res.body.data.state.intervalDays).toBe(1);
    expect(res.body.data.state.dueAt).toBeGreaterThan(Date.now());

    const userId = userIdOf('learner_a');
    expect(stateOf(userId, 'w-abandon')).toBeDefined();
    const logs = db.sqlite
      .prepare('SELECT * FROM review_logs WHERE event_id = ?')
      .all(evt(1)) as Array<Record<string, unknown>>;
    expect(logs).toHaveLength(1);
    expect(logs[0]!.is_correct).toBe(1);
    expect(logs[0]!.rating).toBe('good');
    // 完整留痕：评分后的调度参数
    expect(logs[0]!.ease_factor_after).toBe(2.5);
    expect(logs[0]!.interval_days_after).toBe(1);
    expect(logs[0]!.repetitions_after).toBe(1);
  });

  it('同一 eventId 重复提交幂等：状态与流水都不增加（模拟网络重试）', async () => {
    const before = stateOf(userIdOf('learner_a'), 'w-abandon')!;
    const res = await submit({
      eventId: evt(1),
      wordId: 'w-abandon',
      questionType: 'spelling',
      answer: 'abandon',
      durationMs: 2000,
    });
    expect(res.status).toBe(200);
    // 返回体保持与首次一致（基于已存在的记录），且学习状态未被二次推进
    expect(res.body.data.state.totalReviews).toBe(1);
    const after = stateOf(userIdOf('learner_a'), 'w-abandon')!;
    expect(after.total_reviews).toBe(before.total_reviews);
    expect(after.due_at).toBe(before.due_at);
    const logs = db.sqlite.prepare('SELECT COUNT(*) AS c FROM review_logs WHERE event_id = ?').get(evt(1)) as { c: number };
    expect(logs.c).toBe(1);
  });

  it('答错：评分 again、遗忘计数 +1、当天可再练', async () => {
    const res = await submit({
      eventId: evt(2),
      wordId: 'w-abruptly',
      questionType: 'spelling',
      answer: 'abruptli',
      durationMs: 6000,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.correct).toBe(false);
    expect(res.body.data.rating).toBe('again');
    expect(res.body.data.state.repetitions).toBe(0);
    expect(res.body.data.state.lapses).toBe(1);
    expect(res.body.data.state.totalReviews).toBe(1);
    expect(res.body.data.state.correctReviews).toBe(0);
    // again 之后 10 分钟可再练
    const dueAt = res.body.data.state.dueAt as number;
    expect(dueAt - Date.now()).toBeLessThanOrEqual(10 * MINUTE + 5000);
    expect(dueAt - Date.now()).toBeGreaterThan(9 * MINUTE - 5000);
  });

  it('用时很短 → easy；用时过长 → hard（评分由服务端按用时映射）', async () => {
    const fast = await submit({
      eventId: evt(3),
      wordId: 'w-abandon',
      questionType: 'spelling',
      answer: 'abandon',
      durationMs: 1200,
    });
    expect(fast.body.data.rating).toBe('easy');
    expect(fast.body.data.state.easeFactor).toBeGreaterThan(2.5);

    const slow = await submit({
      eventId: evt(4),
      wordId: 'w-abruptly',
      questionType: 'spelling',
      answer: 'abruptly',
      durationMs: 20000,
    });
    expect(slow.body.data.rating).toBe('hard');
    expect(slow.body.data.state.easeFactor).toBeLessThan(2.5);
  });

  it('释义选择题：任意一条释义都算正确，且服务端返回正确答案', async () => {
    const ok = await submit({
      eventId: evt(5),
      wordId: 'w-abandon',
      questionType: 'definition_choice',
      answer: '放纵',
      durationMs: 3000,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.correct).toBe(true);
    expect(ok.body.data.correctAnswer).toBeDefined();
  });

  it('拼写错误会写入错拼分类记录', async () => {
    const res = await submit({
      eventId: evt(6),
      wordId: 'w-abruptly',
      questionType: 'spelling',
      answer: 'abrubtly',
      durationMs: 5000,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.correct).toBe(false);
    expect(res.body.data.spellingErrors.length).toBeGreaterThan(0);
    const rows = db.sqlite
      .prepare('SELECT error_types FROM spelling_errors WHERE review_log_id = (SELECT id FROM review_logs WHERE event_id = ?)')
      .all(evt(6)) as Array<{ error_types: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.error_types.length).toBeGreaterThan(0);
  });

  it('答对不产生错拼记录', async () => {
    const res = await submit({
      eventId: evt(7),
      wordId: 'w-abandon',
      questionType: 'spelling',
      answer: 'abandon',
      durationMs: 3000,
    });
    expect(res.body.data.spellingErrors).toEqual([]);
  });

  it('每个用户的学习状态相互独立', async () => {
    const res = await submit(
      {
        eventId: evt(8),
        wordId: 'w-abandon',
        questionType: 'spelling',
        answer: 'abandon',
        durationMs: 3000,
      },
      secondToken,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.state.totalReviews).toBe(1);

    const first = stateOf(userIdOf('learner_a'), 'w-abandon')!;
    const second = stateOf(userIdOf('learner_b'), 'w-abandon')!;
    expect(first.total_reviews).not.toBe(second.total_reviews);
    expect(second.total_reviews).toBe(1);
  });

  it('未知词条返回 404 WORD_NOT_FOUND', async () => {
    const res = await submit({
      eventId: evt(9),
      wordId: 'w-not-exists',
      questionType: 'spelling',
      answer: 'x',
      durationMs: 1000,
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('WORD_NOT_FOUND');
  });

  it('非法题型/缺少 eventId 被 DTO 拒绝', async () => {
    const badType = await submit({
      eventId: evt(10),
      wordId: 'w-abandon',
      questionType: 'essay',
      answer: 'x',
      durationMs: 1000,
    });
    expect(badType.status).toBe(400);

    const noEvent = await submit({
      wordId: 'w-abandon',
      questionType: 'spelling',
      answer: 'x',
      durationMs: 1000,
    });
    expect(noEvent.status).toBe(400);
  });

  it('提交内容不可信：客户端不能提交评分或调度参数', async () => {
    const res = await submit({
      eventId: evt(11),
      wordId: 'w-abandon',
      questionType: 'spelling',
      answer: 'abandon',
      durationMs: 3000,
      rating: 'easy',
      easeFactor: 9.9,
      intervalDays: 365,
    });
    // 未声明字段被 DTO 白名单拒绝
    expect(res.status).toBe(400);
  });
});
