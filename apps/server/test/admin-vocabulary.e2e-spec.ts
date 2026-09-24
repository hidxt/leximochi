import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AUDIO_MAX_BYTES } from '@leximochi/types';
import { AppModule } from '../src/app.module';
import { DATABASE } from '../src/database/database.constants';
import { createDatabase, type DatabaseService } from '../src/database/database.service';
import { runMigrations } from '../src/database/migrate';
import { seedSystemRoles } from '../src/database/seed/roles.seed';
import { STORAGE_PROVIDER, type StorageProvider } from '../src/storage/local-storage.provider';
import { buildTestApp } from './helpers/test-app';
import { buildTestEnv } from './helpers/test-env';
import { createAdminAndLogin, registerAndLogin } from './helpers/factories';

const MIGRATIONS = `${__dirname}/../drizzle`;

/** 最小合法 MP3（ID3 头），用于走通真实的文件头校验 */
function mp3Buffer(padding = 64): Buffer {
  return Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.alloc(padding, 0x11)]);
}

function seedWordbook(db: DatabaseService): void {
  const now = Date.now();
  const run = (sql: string, params: unknown[] = []) => db.sqlite.prepare(sql).run(...(params as never[]));
  run(
    `INSERT INTO wordbooks (id, key, name, language, is_system, version, word_count, created_at, updated_at)
     VALUES ('wb1', 'cet4', '四级核心词', 'en', 1, 1, 2, ?, ?)`,
    [now, now],
  );
  for (const [id, headword, definition] of [
    ['w-abandon', 'abandon', '放弃；抛弃'],
    ['w-brief', 'brief', '简短的'],
  ] as const) {
    run(
      `INSERT INTO words (id, headword, headword_canonical, source, created_at, updated_at)
       VALUES (?, ?, ?, 'imported', ?, ?)`,
      [id, headword, headword, now, now],
    );
    run(`INSERT INTO wordbook_entries (wordbook_id, word_id, rank, tags_json) VALUES ('wb1', ?, NULL, NULL)`, [id]);
    run(
      `INSERT INTO word_senses (id, word_id, part_of_speech, definition_zh, sort_order)
       VALUES (?, ?, 'v.', ?, 0)`,
      [`sense-${id}`, id, definition],
    );
  }
}

describe('管理后台词库与词条接口 /admin/wordbooks、/admin/words', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let storage: StorageProvider;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    db = createDatabase(':memory:');
    runMigrations(db, MIGRATIONS);
    seedSystemRoles(db);
    seedWordbook(db);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('CONFIG')
      .useValue(buildTestEnv())
      .overrideProvider(DATABASE)
      .useValue(db)
      .compile();
    app = await buildTestApp(moduleRef);
    storage = app.get<StorageProvider>(STORAGE_PROVIDER);
    adminToken = (await createAdminAndLogin(app, db, 'vocab_admin')).accessToken;
    userToken = (await registerAndLogin(app, 'vocab_user')).accessToken;
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  const asAdmin = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
    request(app.getHttpServer())[method](path).set({ authorization: `Bearer ${adminToken}` });

  const wordOf = (wordId: string) =>
    db.sqlite.prepare('SELECT * FROM words WHERE id = ?').get(wordId) as Record<string, unknown> | undefined;

  const bookOf = (key: string) =>
    db.sqlite.prepare('SELECT * FROM wordbooks WHERE key = ?').get(key) as
      | { id: string; version: number; word_count: number }
      | undefined;

  const auditActions = () =>
    (db.sqlite.prepare('SELECT action FROM audit_logs').all() as Array<{ action: string }>).map((row) => row.action);

  it('普通用户无后台权限：403（权限由服务端校验，不依赖前端隐藏）', async () => {
    const requests = [
      request(app.getHttpServer()).get('/admin/wordbooks'),
      request(app.getHttpServer()).post('/admin/wordbooks').send({ key: 'x1', name: 'x' }),
      request(app.getHttpServer()).get('/admin/words'),
      request(app.getHttpServer()).post('/admin/words/import').send({ wordbookKey: 'cet4', wordbookName: 'x', items: [] }),
      request(app.getHttpServer()).post('/admin/words/w-abandon/audio').field('kind', 'uk'),
      request(app.getHttpServer()).delete('/admin/words/w-abandon').send({ confirm: true }),
    ].map((req) => req.set({ authorization: `Bearer ${userToken}` }));
    const responses = await Promise.all(requests);
    responses.forEach((res) => expect(res.status).toBe(403));
  });

  it('词库列表/详情可读，未登录 401', async () => {
    await request(app.getHttpServer()).get('/admin/wordbooks').expect(401);

    const list = await asAdmin('get', '/admin/wordbooks');
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({ key: 'cet4', wordCount: 2, isSystem: true });

    const detail = await asAdmin('get', `/admin/wordbooks/${bookOf('cet4')!.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.key).toBe('cet4');
    expect((await asAdmin('get', '/admin/wordbooks/not-exists')).status).toBe(404);
  });

  it('新建词库：非法 key 被拒，重复 key 409，成功写入并审计', async () => {
    const badKey = await asAdmin('post', '/admin/wordbooks').send({ key: 'BAD KEY', name: '非法' });
    expect(badKey.status).toBe(400);

    const ok = await asAdmin('post', '/admin/wordbooks').send({
      key: 'postgrad-2026',
      name: '考研核心词',
      description: '自制词库',
      isSystem: false,
    });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ key: 'postgrad-2026', wordCount: 0, version: 1 });

    const dup = await asAdmin('post', '/admin/wordbooks').send({ key: 'postgrad-2026', name: '重复' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('WORDBOOK_KEY_TAKEN');
    expect(auditActions()).toContain('admin.wordbook.created');
  });

  it('更新词库元数据不改变 version（只有词条内容变化才递增）', async () => {
    const id = bookOf('postgrad-2026')!.id;
    const res = await asAdmin('patch', `/admin/wordbooks/${id}`).send({ name: '考研词汇（2026）' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('考研词汇（2026）');
    expect(res.body.data.version).toBe(1);
  });

  it('删除词库需要二次确认，确认后删除并写审计', async () => {
    const id = bookOf('postgrad-2026')!.id;
    const noConfirm = await asAdmin('delete', `/admin/wordbooks/${id}`).send({});
    expect(noConfirm.status).toBe(400);
    expect(noConfirm.body.error.code).toBe('VALIDATION_FAILED');
    expect(bookOf('postgrad-2026')).toBeDefined();

    const removed = await asAdmin('delete', `/admin/wordbooks/${id}`).send({ confirm: true });
    expect(removed.status).toBe(200);
    expect(bookOf('postgrad-2026')).toBeUndefined();
    expect(auditActions()).toContain('admin.wordbook.deleted');
  });

  it('词条检索：按词形/释义匹配、按词库过滤、游标稳定', async () => {
    const byHeadword = await asAdmin('get', '/admin/words?query=aband');
    expect(byHeadword.status).toBe(200);
    expect(byHeadword.body.data.items.map((item: { headword: string }) => item.headword)).toEqual(['abandon']);

    const byDefinition = await asAdmin('get', '/admin/words?query=简短');
    expect(byDefinition.body.data.items.map((item: { headword: string }) => item.headword)).toEqual(['brief']);

    const limited = await asAdmin('get', '/admin/words?limit=1');
    expect(limited.body.data.items).toHaveLength(1);
    expect(limited.body.data.nextCursor).toBeTruthy();
    const next = await asAdmin('get', `/admin/words?limit=1&cursor=${limited.body.data.nextCursor}`);
    expect(next.body.data.items).toHaveLength(1);
    expect(next.body.data.items[0].id).not.toBe(limited.body.data.items[0].id);

    const otherBook = await asAdmin('get', '/admin/words?wordbookId=not-exists');
    expect(otherBook.status).toBe(404);
  });

  it('新建词条：重复词形 409；成功后词库词数与版本递增并写审计', async () => {
    const bookId = bookOf('cet4')!.id;
    const before = bookOf('cet4')!;

    const created = await asAdmin('post', '/admin/words').send({
      wordbookId: bookId,
      headword: 'cautious',
      phoneticUk: '/ˈkɔːʃəs/',
      senses: [{ partOfSpeech: 'adj.', definitionZh: '谨慎的' }],
      examples: [{ textEn: 'Be cautious.', textZh: '要小心。' }],
      rank: 10,
      tags: ['高频'],
    });
    expect(created.status).toBe(201);
    const wordId = created.body.data.wordId as string;
    expect(created.body.data.created).toBe(true);

    const row = wordOf(wordId);
    expect(row?.headword).toBe('cautious');
    const after = bookOf('cet4')!;
    expect(after.word_count).toBe(before.word_count + 1);
    expect(after.version).toBe(before.version + 1);

    const dup = await asAdmin('post', '/admin/words').send({
      wordbookId: bookId,
      headword: 'Cautious',
      senses: [{ definitionZh: '重复' }],
    });
    expect(dup.status).toBe(409);
    expect(auditActions()).toContain('admin.word.created');
  });

  it('更新词条：以提交内容为准替换义项（可删减），并递增词库版本', async () => {
    const id = 'w-abandon';
    const before = bookOf('cet4')!;

    const updated = await asAdmin('patch', `/admin/words/${id}`).send({
      headword: 'abandon',
      senses: [{ partOfSpeech: 'v.', definitionZh: '抛弃；遗弃' }],
    });
    expect(updated.status).toBe(200);

    const senses = db.sqlite
      .prepare('SELECT definition_zh FROM word_senses WHERE word_id = ?')
      .all(id) as Array<{ definition_zh: string }>;
    expect(senses).toHaveLength(1);
    expect(senses[0]!.definition_zh).toBe('抛弃；遗弃');
    expect(bookOf('cet4')!.version).toBe(before.version + 1);
    expect(auditActions()).toContain('admin.word.updated');

    const rename = await asAdmin('patch', `/admin/words/${id}`).send({
      headword: 'brief',
      senses: [{ definitionZh: '改名撞车' }],
    });
    expect(rename.status).toBe(409);
  });

  it('批量导入：返回逐条结果，非法词条被跳过而其余入库，并写审计', async () => {
    const summary = await asAdmin('post', '/admin/words/import').send({
      wordbookKey: 'cet6',
      wordbookName: '六级核心词',
      items: [
        { headword: 'diligent', senses: [{ definitionZh: '勤勉的' }] },
        { headword: '', senses: [{ definitionZh: '缺词形' }] },
        { headword: 'elaborate', senses: [{ definitionZh: '精心制作的' }], examples: [{ textEn: '', textZh: '' }] },
      ],
    });
    expect(summary.status).toBe(200);
    expect(summary.body.data).toMatchObject({ wordbookKey: 'cet6', created: 1, wordCount: 1 });
    expect(summary.body.data.failed).toHaveLength(2);
    expect(summary.body.data.failed[0]).toMatchObject({ index: 1, reason: '缺少词形' });
    expect(auditActions()).toContain('admin.words.imported');
  });

  it('上传音频：真实 MP3 通过；伪造扩展名、超大文件与未知词条被拒绝', async () => {
    const ok = await asAdmin('post', '/admin/words/w-brief/audio')
      .field('kind', 'uk')
      .attach('file', mp3Buffer(), 'brief.mp3');
    expect(ok.status).toBe(200);
    const audioKey = ok.body.data.audioKey as string;
    expect(audioKey.startsWith('word-audio/')).toBe(true);
    expect(wordOf('w-brief')?.audio_uk_key).toBe(audioKey);
    expect(await storage.exists(audioKey)).toBe(true);
    expect(auditActions()).toContain('admin.word.audio_uploaded');

    const fake = await asAdmin('post', '/admin/words/w-brief/audio')
      .field('kind', 'us')
      .attach('file', Buffer.from('this is not audio at all'), 'fake.mp3');
    expect(fake.status).toBe(415);
    expect(fake.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(wordOf('w-brief')?.audio_us_key).toBeNull();

    const tooBig = await asAdmin('post', '/admin/words/w-brief/audio')
      .field('kind', 'uk')
      .attach('file', Buffer.alloc(AUDIO_MAX_BYTES + 1024, 0x11), 'big.mp3');
    expect([413, 415]).toContain(tooBig.status);

    const missingWord = await asAdmin('post', '/admin/words/w-none/audio')
      .field('kind', 'uk')
      .attach('file', mp3Buffer(), 'x.mp3');
    expect(missingWord.status).toBe(404);

    await storage.delete(audioKey);
  });

  it('删除词条需要二次确认；确认后词条消失并写审计', async () => {
    const noConfirm = await asAdmin('delete', '/admin/words/w-brief').send({ confirm: false });
    expect(noConfirm.status).toBe(400);
    expect(wordOf('w-brief')).toBeDefined();

    const removed = await asAdmin('delete', '/admin/words/w-brief').send({ confirm: true });
    expect(removed.status).toBe(200);
    expect(wordOf('w-brief')).toBeUndefined();
    expect(auditActions()).toContain('admin.word.deleted');

    expect((await asAdmin('get', '/admin/words/w-brief')).status).toBe(404);
  });

  it('审计日志不记录任何秘密（抽查字段）', () => {
    const rows = db.sqlite
      .prepare("SELECT metadata_json FROM audit_logs WHERE action LIKE 'admin.word%'")
      .all() as Array<{ metadata_json: string | null }>;
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => {
      expect(row.metadata_json ?? '').not.toMatch(/audioKey|token|secret|password/i);
    });
  });
});
