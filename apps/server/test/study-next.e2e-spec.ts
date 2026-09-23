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
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/** 词条 ID 用 UUID（与生产一致），便于断言「题目中不泄露答案词形」 */
const WORDS = [
  { id: '11111111-1111-4111-8111-111111111111', headword: 'abandon', pos: 'v.', zh: '放弃；抛弃' },
  { id: '22222222-2222-4222-8222-222222222222', headword: 'abruptly', pos: 'adv', zh: '突然地' },
  { id: '33333333-3333-4333-8333-333333333333', headword: 'ability', pos: 'n.', zh: '能力；才能' },
  { id: '44444444-4444-4444-8444-444444444444', headword: 'absorb', pos: 'v.', zh: '吸收；使专心' },
  { id: '55555555-5555-4555-8555-555555555555', headword: 'academic', pos: 'adj', zh: '学术的' },
  { id: '66666666-6666-4666-8666-666666666666', headword: 'accompany', pos: 'v.', zh: '陪伴；伴随' },
];

function seed(db: DatabaseService): void {
  const now = Date.now();
  const run = (sql: string, params: unknown[] = []) => db.sqlite.prepare(sql).run(...(params as never[]));
  run(
    `INSERT INTO wordbooks (id, key, name, language, is_system, version, word_count, created_at, updated_at)
     VALUES ('wb-cet4', 'cet4', '四级核心词', 'en', 1, 1, ?, ?, ?)`,
    [WORDS.length, now, now],
  );
  WORDS.forEach((word, index) => {
    run(
      `INSERT INTO words (id, headword, headword_canonical, phonetic_uk, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'imported', ?, ?)`,
      [word.id, word.headword, word.headword, `/${word.headword}/`, now, now],
    );
    run(
      `INSERT INTO wordbook_entries (wordbook_id, word_id, rank, tags_json) VALUES ('wb-cet4', ?, ?, NULL)`,
      [word.id, index + 1],
    );
    run(
      `INSERT INTO word_senses (id, word_id, part_of_speech, definition_zh, sort_order)
       VALUES (?, ?, ?, ?, 0)`,
      [`sense-${index}`, word.id, word.pos, word.zh],
    );
  });
}

describe('POST /study/next（出题与选词）', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    db = createDatabase(':memory:');
    runMigrations(db, MIGRATIONS);
    seedSystemRoles(db);
    seed(db);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('CONFIG')
      .useValue(buildTestEnv())
      .overrideProvider(DATABASE)
      .useValue(db)
      .compile();
    app = await buildTestApp(moduleRef);
    await registerUser(app, 'studier');
    const session = await loginUser(app, 'studier');
    token = session.accessToken;
    userId = session.userId;
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  const next = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/study/next')
      .set({ authorization: `Bearer ${token}` })
      .send(body);

  const submit = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/review/submit')
      .set({ authorization: `Bearer ${token}` })
      .send(body);

  const setDue = (wordId: string, dueAt: number) =>
    db.sqlite
      .prepare('UPDATE user_word_states SET due_at = ? WHERE user_id = ? AND word_id = ?')
      .run(dueAt, userId, wordId);

  it('未登录返回 401；非法 mode 返回 400', async () => {
    await request(app.getHttpServer()).post('/study/next').send({ mode: 'new' }).expect(401);
    const bad = await next({ mode: 'listening' });
    expect(bad.status).toBe(400);
  });

  it('新词模式：按词库 rank 顺序给出未学过的词，且题目不含答案', async () => {
    const res = await next({ mode: 'new', wordbookKey: 'cet4' });
    expect(res.status).toBe(200);
    const question = res.body.data.question as Record<string, unknown>;
    expect(question).not.toBeNull();
    expect(question.wordId).toBe(WORDS[0]!.id);
    expect(question.questionType).toBe('definition_choice');
    expect(question.requiresInput).toBe(false);

    const options = question.options as string[];
    expect(options.length).toBe(4);
    expect(options).toContain(WORDS[0]!.zh);
    // 选项互不重复，且都来自其他词的释义
    expect(new Set(options).size).toBe(4);
    for (const option of options) {
      expect(WORDS.map((w) => w.zh)).toContain(option);
    }
    // 进度：词库里 6 个词都还没学过（拿题不等于已学，需提交后才计入）
    expect(res.body.data.progress.newRemaining).toBe(6);
    expect(res.body.data.progress.learnedToday).toBe(0);
    expect(res.body.data.progress.dailyNewTarget).toBeGreaterThan(0);
  });

  it('复习模式：没有到期词时返回空题目，且进度如实反映', async () => {
    const res = await next({ mode: 'review' });
    expect(res.status).toBe(200);
    expect(res.body.data.question).toBeNull();
    expect(res.body.data.progress.dueRemaining).toBe(0);
  });

  it('学习一个词后它不再作为新词出现，且进入复习队列后才被复习模式选中', async () => {
    const learned = await submit({
      eventId: 'study-event-0001',
      wordId: WORDS[0]!.id,
      questionType: 'definition_choice',
      answer: WORDS[0]!.zh,
      durationMs: 3000,
    });
    expect(learned.status).toBe(200);
    expect(learned.body.data.correct).toBe(true);

    // 新词模式的剩余量减少，且不再给出已学过的词
    const afterLearn = await next({ mode: 'new', wordbookKey: 'cet4' });
    expect(afterLearn.body.data.progress.newRemaining).toBe(5);
    expect((afterLearn.body.data.question as Record<string, unknown>).wordId).toBe(WORDS[1]!.id);
    expect(afterLearn.body.data.progress.learnedToday).toBe(1);

    // 刚学会（1 天后到期）尚未到期 → 复习模式不选它
    const reviewBefore = await next({ mode: 'review' });
    expect(reviewBefore.body.data.question).toBeNull();

    // 把到期时间改到过去，模拟到期
    setDue(WORDS[0]!.id, Date.now() - MINUTE);
    const reviewAfter = await next({ mode: 'review' });
    expect(reviewAfter.status).toBe(200);
    expect((reviewAfter.body.data.question as Record<string, unknown>).wordId).toBe(WORDS[0]!.id);
    expect(reviewAfter.body.data.progress.dueRemaining).toBe(1);
    expect(reviewAfter.body.data.progress.reviewedToday).toBe(0);
  });

  it('复习题目不泄露答案词形（中译英/拼写题只给中文与音标）', async () => {
    const res = await next({ mode: 'review' });
    const question = res.body.data.question as Record<string, unknown>;
    expect(['zh_to_en', 'spelling', 'definition_choice']).toContain(question.questionType);
    if (question.questionType !== 'definition_choice') {
      // 输入型题目：题干、选项里都不能出现答案词形
      expect(JSON.stringify(question.prompt)).not.toContain('abandon');
      expect(JSON.stringify(question.options)).not.toContain('abandon');
      expect(question.requiresInput).toBe(true);
    }
  });

  it('拼写训练模式：只从已学过的词里出输入型题目', async () => {
    const res = await next({ mode: 'spelling' });
    expect(res.status).toBe(200);
    const question = res.body.data.question as Record<string, unknown>;
    expect(question.wordId).toBe(WORDS[0]!.id);
    expect(question.questionType).toBe('spelling');
    expect(question.requiresInput).toBe(true);
    expect(question.phonetic).toBeTruthy();
    expect((question.options as string[]).length).toBe(0);
  });

  it('听写模式：无音频资源时明确告知不可用，而不是静默返回空', async () => {
    const res = await next({ mode: 'dictation' });
    expect(res.status).toBe(200);
    expect(res.body.data.question).toBeNull();
    expect(String(res.body.data.notice ?? '')).toMatch(/音频/);
  });

  it('错拼过的词在复习模式中优先出现（错拼加权优先于逾期时长）', async () => {
    // 让两个词都进入复习队列：WORDS[0] 逾期更久，因此基线应由它先出
    await submit({
      eventId: 'study-event-0002',
      wordId: WORDS[1]!.id,
      questionType: 'spelling',
      answer: 'abruptly',
      durationMs: 4000,
    });
    setDue(WORDS[0]!.id, Date.now() - DAY * 2);
    setDue(WORDS[1]!.id, Date.now() - DAY);

    const baseline = await next({ mode: 'review' });
    expect((baseline.body.data.question as { wordId: string }).wordId).toBe(WORDS[0]!.id);

    // 让「逾期较短的」WORDS[1] 发生一次错拼，加权后它应当优先出现
    await submit({
      eventId: 'study-event-0003',
      wordId: WORDS[1]!.id,
      questionType: 'spelling',
      answer: 'abrubtly',
      durationMs: 5000,
    });
    setDue(WORDS[0]!.id, Date.now() - DAY * 2);
    setDue(WORDS[1]!.id, Date.now() - DAY);

    const weighted = await next({ mode: 'review' });
    expect((weighted.body.data.question as { wordId: string }).wordId).toBe(WORDS[1]!.id);
  });

  it('新词模式未指定词库时使用默认词库；词库不存在时 404', async () => {
    const res = await next({ mode: 'new' });
    expect(res.status).toBe(200);

    const missing = await next({ mode: 'new', wordbookKey: 'not-exists' });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('WORDBOOK_NOT_FOUND');
  });
});
