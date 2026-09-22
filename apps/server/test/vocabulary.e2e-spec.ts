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

function seedVocabulary(db: DatabaseService): void {
  const now = Date.now();
  const insert = (sql: string, params: unknown[]) => db.sqlite.prepare(sql).run(...(params as never[]));

  // 两个系统词库 + 一个「第三方」词库：验证词库是纯数据、无需改代码即可出现
  insert(
    `INSERT INTO wordbooks (id, key, name, description, language, is_system, version, word_count, created_at, updated_at)
     VALUES ('wb-cet4', 'cet4', '四级核心词', 'CET-4 高频词', 'en', 1, 3, 2, ?, ?)`,
    [now, now],
  );
  insert(
    `INSERT INTO wordbooks (id, key, name, language, is_system, version, word_count, created_at, updated_at)
     VALUES ('wb-cet6', 'cet6', '六级核心词', 'en', 1, 1, 1, ?, ?)`,
    [now, now],
  );
  insert(
    `INSERT INTO wordbooks (id, key, name, language, is_system, version, word_count, created_at, updated_at)
     VALUES ('wb-custom', 'my-own-list', '我的自定义词库', 'en', 0, 1, 1, ?, ?)`,
    [now, now],
  );

  insert(
    `INSERT INTO words (id, headword, headword_canonical, phonetic_uk, phonetic_us, audio_uk_key, source, created_at, updated_at)
     VALUES ('w-abandon', 'abandon', 'abandon', '/əˈbændən/', '/əˈbændən/', 'words/uk/abandon.mp3', 'dictionary', ?, ?)`,
    [now, now],
  );
  insert(
    `INSERT INTO words (id, headword, headword_canonical, source, created_at, updated_at)
     VALUES ('w-ability', 'ability', 'ability', 'dictionary', ?, ?)`,
    [now, now],
  );
  insert(
    `INSERT INTO words (id, headword, headword_canonical, source, created_at, updated_at)
     VALUES ('w-absorb', 'absorb', 'absorb', 'dictionary', ?, ?)`,
    [now, now],
  );

  // cet4 含 abandon / ability；cet6 含 abandon；自定义词库含 absorb
  insert(`INSERT INTO wordbook_entries (wordbook_id, word_id, rank, tags_json) VALUES ('wb-cet4', 'w-abandon', 1, '["高频"]')`, []);
  insert(`INSERT INTO wordbook_entries (wordbook_id, word_id, rank, tags_json) VALUES ('wb-cet4', 'w-ability', 2, NULL)`, []);
  insert(`INSERT INTO wordbook_entries (wordbook_id, word_id, rank, tags_json) VALUES ('wb-cet6', 'w-abandon', 1, NULL)`, []);
  insert(`INSERT INTO wordbook_entries (wordbook_id, word_id, rank, tags_json) VALUES ('wb-custom', 'w-absorb', 1, NULL)`, []);

  insert(
    `INSERT INTO word_senses (id, word_id, part_of_speech, definition_zh, definition_en, exam_meaning, sort_order)
     VALUES ('s1', 'w-abandon', 'v.', '放弃；抛弃', 'to leave someone or something', '四级常考：abandon oneself to 沉溺于', 0)`,
    [],
  );
  insert(
    `INSERT INTO word_senses (id, word_id, part_of_speech, definition_zh, sort_order)
     VALUES ('s2', 'w-abandon', 'n.', '放纵', 1)`,
    [],
  );
  insert(
    `INSERT INTO word_examples (id, word_id, sense_id, text_en, text_zh, audio_key, sort_order)
     VALUES ('e1', 'w-abandon', 's1', 'He abandoned his car.', '他丢弃了汽车。', NULL, 0)`,
    [],
  );
  insert(
    `INSERT INTO word_phrases (id, word_id, kind, text, translation, sort_order)
     VALUES ('p1', 'w-abandon', 'phrase', 'abandon oneself to', '沉溺于', 0)`,
    [],
  );
  insert(
    `INSERT INTO word_phrases (id, word_id, kind, text, translation, sort_order)
     VALUES ('p2', 'w-abandon', 'collocation', 'abandon hope', '放弃希望', 1)`,
    [],
  );
  insert(
    `INSERT INTO word_forms (id, word_id, form_type, value) VALUES ('f1', 'w-abandon', 'past', 'abandoned')`,
    [],
  );
  insert(
    `INSERT INTO word_relations (id, word_id, relation_type, target_word_id, target_text)
     VALUES ('r1', 'w-abandon', 'synonym', 'w-absorb', NULL)`,
    [],
  );
  insert(
    `INSERT INTO word_relations (id, word_id, relation_type, target_text)
     VALUES ('r2', 'w-abandon', 'confusable', 'abundant')`,
    [],
  );
  // AI 补充内容：独立表，不得影响词典字段
  insert(
    `INSERT INTO word_ai_notes (id, word_id, memory_tip, usage_note, confusable_note, extra_examples_json, provider, model, generated_at)
     VALUES ('ai1', 'w-abandon', 'a-band-on：把 band 想成乐队，乐队散了就是放弃', '多用于正式书面语', '勿与 abundant 混淆', '[{"textEn":"They abandoned the plan.","textZh":"他们放弃了这个计划。"}]', 'openai-compatible', 'test-model', ?)`,
    [now],
  );
}

describe('词库与词条只读接口', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let accessToken: string;

  beforeAll(async () => {
    db = createDatabase(':memory:');
    runMigrations(db, MIGRATIONS);
    seedSystemRoles(db);
    seedVocabulary(db);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('CONFIG')
      .useValue(buildTestEnv())
      .overrideProvider(DATABASE)
      .useValue(db)
      .compile();
    app = await buildTestApp(moduleRef);
    await registerUser(app, 'vocab_user');
    accessToken = (await loginUser(app, 'vocab_user')).accessToken;
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  const auth = () => ({ authorization: `Bearer ${accessToken}` });

  it('未登录访问词库接口返回 401', async () => {
    await expect(request(app.getHttpServer()).get('/wordbooks').expect(401)).resolves.toBeDefined();
    await expect(request(app.getHttpServer()).get('/words/w-abandon').expect(401)).resolves.toBeDefined();
  });

  it('GET /wordbooks 返回全部词库（含非系统词库，证明词库是数据而非硬编码）', async () => {
    const res = await request(app.getHttpServer()).get('/wordbooks').set(auth());
    expect(res.status).toBe(200);
    const keys = (res.body.data as Array<{ key: string }>).map((item) => item.key).sort();
    expect(keys).toEqual(['cet4', 'cet6', 'my-own-list']);

    const cet4 = (res.body.data as Array<{ key: string; version: number; isSystem: boolean }>).find(
      (item) => item.key === 'cet4',
    );
    expect(cet4?.version).toBe(3);
    expect(cet4?.isSystem).toBe(true);
  });

  it('GET /wordbooks/:key/version 返回版本与词数，供离线下载比对', async () => {
    const res = await request(app.getHttpServer()).get('/wordbooks/cet4/version').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ key: 'cet4', version: 3, wordCount: 2 });
  });

  it('未知词库返回 404 WORDBOOK_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer()).get('/wordbooks/not-exists/version').set(auth());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('WORDBOOK_NOT_FOUND');
  });

  it('GET /wordbooks/:key/words 分页导出完整词条数据', async () => {
    const first = await request(app.getHttpServer())
      .get('/wordbooks/cet4/words?limit=1')
      .set(auth());
    expect(first.status).toBe(200);
    expect(first.body.data.items).toHaveLength(1);
    const [entry] = first.body.data.items as Array<Record<string, unknown>>;
    expect(entry.headword).toBeDefined();
    expect(entry.senses).toBeDefined();
    expect(entry.examples).toBeDefined();
    expect(entry.phrases).toBeDefined();
    expect(entry.forms).toBeDefined();
    expect(entry.relations).toBeDefined();

    const cursor = first.body.data.nextCursor as string;
    expect(typeof cursor).toBe('string');
    const second = await request(app.getHttpServer())
      .get(`/wordbooks/cet4/words?limit=1&cursor=${encodeURIComponent(cursor)}`)
      .set(auth());
    expect(second.status).toBe(200);
    expect(second.body.data.items).toHaveLength(1);
    const ids = new Set([
      (first.body.data.items[0] as { id: string }).id,
      (second.body.data.items[0] as { id: string }).id,
    ]);
    expect(ids.size).toBe(2);
    expect(second.body.data.nextCursor).toBeNull();
  });

  it('导出分页 limit 超过上限时被拒绝（DTO 校验）', async () => {
    const res = await request(app.getHttpServer())
      .get('/wordbooks/cet4/words?limit=500')
      .set(auth());
    expect(res.status).toBe(400);
  });

  it('GET /words/:id 返回完整词典数据与独立的 AI 补充', async () => {
    const res = await request(app.getHttpServer()).get('/words/w-abandon').set(auth());
    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, unknown>;
    expect(data.headword).toBe('abandon');
    expect((data.senses as unknown[]).length).toBe(2);
    expect((data.examples as unknown[]).length).toBe(1);
    expect((data.phrases as unknown[]).length).toBe(2);
    expect((data.forms as unknown[]).length).toBe(1);
    expect((data.relations as unknown[]).length).toBe(2);
    // state 为 null（该用户尚未学习该词）
    expect(data.state).toBeNull();

    const aiNotes = data.aiNotes as Record<string, unknown>;
    expect(aiNotes.memoryTip).toContain('band');
    expect(aiNotes.extraExamples).toHaveLength(1);
    // AI 内容不得出现在词典字段里
    expect(JSON.stringify(data.senses)).not.toContain('a-band-on');
  });

  it('未知词条返回 404 WORD_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer()).get('/words/not-a-word').set(auth());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('WORD_NOT_FOUND');
  });

  it('GET /words/search 支持按词形搜索并可按词库过滤', async () => {
    const all = await request(app.getHttpServer()).get('/words/search?q=ab').set(auth());
    expect(all.status).toBe(200);
    const headwords = (all.body.data as Array<{ headword: string }>).map((item) => item.headword).sort();
    expect(headwords).toEqual(['abandon', 'ability', 'absorb']);

    const onlyCustom = await request(app.getHttpServer())
      .get('/words/search?q=ab&wordbookKey=my-own-list')
      .set(auth());
    expect(onlyCustom.status).toBe(200);
    expect((onlyCustom.body.data as Array<{ headword: string }>).map((i) => i.headword)).toEqual([
      'absorb',
    ]);
  });

  it('搜索关键词中的 LIKE 通配符被转义（不会匹配全部）', async () => {
    const res = await request(app.getHttpServer()).get('/words/search?q=%25').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('响应不泄露音频存储的绝对路径', async () => {
    const res = await request(app.getHttpServer()).get('/words/w-abandon').set(auth());
    const body = JSON.stringify(res.body);
    expect(body.includes('data/uploads')).toBe(false);
    expect(body.includes('data\\uploads')).toBe(false);
    // 出现 Windows 盘符形式的绝对路径即视为泄露
    expect(/[A-Za-z]:[\\/]/.test(body)).toBe(false);
  });
});
