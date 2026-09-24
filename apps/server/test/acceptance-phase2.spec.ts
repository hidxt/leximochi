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
     VALUES ('wb1', 'cet4', '四级核心词', 'en', 1, 1, 1, ?, ?)`,
    [now, now],
  );
  run(
    `INSERT INTO words (id, headword, headword_canonical, source, created_at, updated_at)
     VALUES ('w-abandon', 'abandon', 'abandon', 'imported', ?, ?)`,
    [now, now],
  );
  run(`INSERT INTO wordbook_entries (wordbook_id, word_id, rank, tags_json) VALUES ('wb1','w-abandon',1,NULL)`);
  run(
    `INSERT INTO word_senses (id, word_id, part_of_speech, definition_zh, sort_order)
     VALUES ('s1', 'w-abandon', 'v.', '放弃；抛弃', 0)`,
  );
}

/**
 * Phase 2 验收标准中需要显式证据的几项：
 * 并发幂等、词库可扩展、AI 内容与词典数据隔离、错误响应不泄露实现细节。
 */
describe('Phase 2 验收补充', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let token: string;

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
    await registerUser(app, 'acceptance_user');
    token = (await loginUser(app, 'acceptance_user')).accessToken;
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  const submit = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/review/submit')
      .set({ authorization: `Bearer ${token}` })
      .send(body);

  it('并发提交同一 eventId 只落一条流水、只推进一次状态', async () => {
    const body = {
      eventId: 'concurrent-event-0001',
      wordId: 'w-abandon',
      questionType: 'spelling',
      answer: 'abandon',
      durationMs: 2000,
    };
    const responses = await Promise.all([submit(body), submit(body), submit(body)]);
    responses.forEach((res) => expect(res.status).toBe(200));

    const logs = db.sqlite
      .prepare('SELECT COUNT(*) AS c FROM review_logs WHERE event_id = ?')
      .get('concurrent-event-0001') as { c: number };
    expect(logs.c).toBe(1);

    const state = db.sqlite
      .prepare('SELECT total_reviews, correct_reviews FROM user_word_states WHERE word_id = ?')
      .get('w-abandon') as { total_reviews: number; correct_reviews: number };
    expect(state.total_reviews).toBe(1);
    expect(state.correct_reviews).toBe(1);
  });

  it('新增词库无需改业务代码即可被列出并用于出题', async () => {
    const now = Date.now();
    db.sqlite
      .prepare(
        `INSERT INTO wordbooks (id, key, name, language, is_system, version, word_count, created_at, updated_at)
         VALUES ('wb-gre', 'gre', 'GRE 核心词', 'en', 0, 7, 1, ?, ?)`,
      )
      .run(now, now);
    db.sqlite
      .prepare(
        `INSERT INTO words (id, headword, headword_canonical, source, created_at, updated_at)
         VALUES ('w-ubiquitous', 'ubiquitous', 'ubiquitous', 'imported', ?, ?)`,
      )
      .run(now, now);
    db.sqlite
      .prepare(`INSERT INTO wordbook_entries (wordbook_id, word_id, rank, tags_json) VALUES ('wb-gre','w-ubiquitous',1,NULL)`)
      .run();
    db.sqlite
      .prepare(
        `INSERT INTO word_senses (id, word_id, part_of_speech, definition_zh, sort_order)
         VALUES ('s-gre1', 'w-ubiquitous', 'adj.', '无处不在的', 0)`,
      )
      .run();

    const books = await request(app.getHttpServer())
      .get('/wordbooks')
      .set({ authorization: `Bearer ${token}` });
    expect(books.status).toBe(200);
    expect(books.body.data.map((book: { key: string }) => book.key)).toContain('gre');

    const version = await request(app.getHttpServer())
      .get('/wordbooks/gre/version')
      .set({ authorization: `Bearer ${token}` });
    expect(version.body.data).toMatchObject({ key: 'gre', version: 7, wordCount: 1 });

    const next = await request(app.getHttpServer())
      .post('/study/next')
      .set({ authorization: `Bearer ${token}` })
      .send({ mode: 'new', wordbookKey: 'gre' });
    expect(next.status).toBe(200);
    expect(next.body.data.question.prompt).toBe('ubiquitous');
  });

  it('AI 补充内容独立存储，不覆盖词典字段', async () => {
    db.sqlite
      .prepare(
        `INSERT INTO word_ai_notes (id, word_id, memory_tip, usage_note, confusable_note, extra_examples_json, provider, model, generated_at)
         VALUES ('ai1', 'w-abandon', '联想记忆：abandon = a + band + on', '多用于书面语', '别与 abundant 混淆', ?, 'openai', 'gpt-4o-mini', ?)`,
      )
      .run(JSON.stringify([{ textEn: 'AI example.', textZh: 'AI 例句。' }]), Date.now());

    const detail = await request(app.getHttpServer())
      .get('/words/w-abandon')
      .set({ authorization: `Bearer ${token}` });
    expect(detail.status).toBe(200);
    // 词典字段保持原样
    expect(detail.body.data.senses).toHaveLength(1);
    expect(detail.body.data.senses[0].definitionZh).toBe('放弃；抛弃');
    // AI 内容单独一段返回
    expect(detail.body.data.aiNotes).toMatchObject({
      memoryTip: '联想记忆：abandon = a + band + on',
      confusableNote: '别与 abundant 混淆',
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    expect(detail.body.data.aiNotes.extraExamples).toEqual([
      { textEn: 'AI example.', textZh: 'AI 例句。' },
    ]);
  });

  it('错误响应不泄露堆栈、文件路径或数据库细节', async () => {
    const notFound = await request(app.getHttpServer())
      .get('/words/does-not-exist')
      .set({ authorization: `Bearer ${token}` });
    expect(notFound.status).toBe(404);

    const invalid = await submit({ wordId: 'w-abandon' });
    expect(invalid.status).toBe(400);

    for (const res of [notFound, invalid]) {
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toMatch(/sqlite|node_modules|dist[\\/]|C:\\\\|at Object\.|stack/i);
      expect(res.body.error).toMatchObject({ code: expect.any(String), message: expect.any(String) });
      expect(res.body.error.requestId).toBeTruthy();
    }
  });
});
