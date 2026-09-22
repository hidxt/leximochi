import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, type DatabaseService } from '../src/database/database.service';
import { runMigrations } from '../src/database/migrate';
import { seedSystemRoles } from '../src/database/seed/roles.seed';

const MIGRATIONS = join(__dirname, '..', 'drizzle');

const PHASE2_TABLES = [
  'wordbooks',
  'words',
  'wordbook_entries',
  'word_senses',
  'word_examples',
  'word_phrases',
  'word_forms',
  'word_relations',
  'word_ai_notes',
  'user_word_states',
  'review_logs',
  'user_notebook',
  'spelling_errors',
];

describe('Phase 2 数据库 schema', () => {
  let dir: string;
  let db: DatabaseService;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'leximochi-p2-'));
    db = createDatabase(join(dir, 'test.sqlite'));
    runMigrations(db, MIGRATIONS);
    seedSystemRoles(db);

    const now = Date.now();
    db.sqlite
      .prepare(
        `INSERT INTO users (id, username, username_canonical, password_hash, password_algo,
           password_updated_at, status, created_at, updated_at)
         VALUES ('u1', 'alice', 'alice', 'hash', 'argon2id', ?, 'active', ?, ?)`,
      )
      .run(now, now, now);
    db.sqlite
      .prepare(
        `INSERT INTO wordbooks (id, key, name, language, is_system, version, word_count, created_at, updated_at)
         VALUES ('wb1', 'cet4', '四级核心词', 'en', 1, 1, 0, ?, ?)`,
      )
      .run(now, now);
    db.sqlite
      .prepare(
        `INSERT INTO words (id, headword, headword_canonical, source, created_at, updated_at)
         VALUES ('w1', 'abandon', 'abandon', 'dictionary', ?, ?)`,
      )
      .run(now, now);
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('migration 创建全部 13 张 Phase 2 表', () => {
    const rows = db.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = rows.map((r) => r.name);
    for (const table of PHASE2_TABLES) {
      expect(names).toContain(table);
    }
  });

  it('migration 可重复执行且不重建表', () => {
    runMigrations(db, MIGRATIONS);
    const count = db.sqlite
      .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table'")
      .get() as { c: number };
    expect(count.c).toBeGreaterThanOrEqual(PHASE2_TABLES.length + 10);
  });

  it('review_logs.event_id 唯一约束生效（幂等的最后防线）', () => {
    const now = Date.now();
    const insert = db.sqlite.prepare(
      `INSERT INTO review_logs (id, user_id, word_id, event_id, question_type, answer_raw, is_correct,
         rating, duration_ms, answered_at, ease_factor_after, interval_days_after,
         repetitions_after, due_at_after, source, created_at)
       VALUES (?, 'u1', 'w1', ?, 'spelling', 'abandon', 1, 'good', 1200, ?, 2.5, 1, 1, ?, 'web', ?)`,
    );
    insert.run('r1', 'evt-1', now, now + 86_400_000, now);
    expect(() => insert.run('r2', 'evt-1', now, now + 86_400_000, now)).toThrow(/UNIQUE/i);
  });

  it('words.headword_canonical 唯一约束生效', () => {
    const now = Date.now();
    const insert = db.sqlite.prepare(
      `INSERT INTO words (id, headword, headword_canonical, source, created_at, updated_at)
       VALUES (?, ?, ?, 'dictionary', ?, ?)`,
    );
    expect(() => insert.run('w2', 'Abandon', 'abandon', now, now)).toThrow(/UNIQUE/i);
    // 不同词的归一化形式不同则可插入
    insert.run('w3', 'ability', 'ability', now, now);
  });

  it('user_word_states 复合主键生效（同一用户同一词只有一条状态）', () => {
    const now = Date.now();
    const insert = db.sqlite.prepare(
      `INSERT INTO user_word_states (user_id, word_id, status, ease_factor, interval_days,
         repetitions, lapses, total_reviews, correct_reviews, created_at, updated_at)
       VALUES ('u1', ?, 'new', 2.5, 0, 0, 0, 0, 0, ?, ?)`,
    );
    insert.run('w1', now, now);
    expect(() => insert.run('w1', now, now)).toThrow(/UNIQUE|PRIMARY KEY/i);
  });

  it('wordbook_entries 关联词库与词条，删除词库级联清理', () => {
    db.sqlite
      .prepare(
        `INSERT INTO wordbook_entries (wordbook_id, word_id, rank, tags_json)
         VALUES ('wb1', 'w1', 1, '["高频"]')`,
      )
      .run();
    db.sqlite.prepare(`INSERT INTO wordbooks (id, key, name, language, is_system, version, word_count, created_at, updated_at)
       VALUES ('wb2', 'cet6', '六级核心词', 'en', 1, 1, 0, 1, 1)`).run();
    db.sqlite
      .prepare(`INSERT INTO wordbook_entries (wordbook_id, word_id, rank, tags_json) VALUES ('wb2', 'w1', 1, NULL)`)
      .run();

    db.sqlite.prepare("DELETE FROM wordbooks WHERE id = 'wb2'").run();
    const remaining = db.sqlite
      .prepare("SELECT COUNT(*) AS c FROM wordbook_entries WHERE wordbook_id = 'wb2'")
      .get() as { c: number };
    expect(remaining.c).toBe(0);
    // 词条本身仍存在（全局共享），且仍属于 cet4
    const wordStillThere = db.sqlite
      .prepare("SELECT COUNT(*) AS c FROM words WHERE id = 'w1'")
      .get() as { c: number };
    expect(wordStillThere.c).toBe(1);
  });

  it('word_ai_notes 与词典数据分离：一个词最多一条 AI 补充', () => {
    const insert = db.sqlite.prepare(
      `INSERT INTO word_ai_notes (id, word_id, memory_tip, generated_at) VALUES (?, 'w1', ?, ?)`,
    );
    insert.run('ai1', 'a-bandon 联想记忆', Date.now());
    expect(() => insert.run('ai2', '另一条', Date.now())).toThrow(/UNIQUE/i);
  });

  it('spelling_errors 外键指向 review_logs，删除复习记录时级联清理', () => {
    const now = Date.now();
    db.sqlite
      .prepare(
        `INSERT INTO spelling_errors (id, user_id, word_id, review_log_id, expected, actual, error_types, created_at)
         VALUES ('se1', 'u1', 'w1', 'r1', 'abandon', 'abandom', 'wrong_letter', ?)`,
      )
      .run(now);
    db.sqlite.prepare("DELETE FROM review_logs WHERE id = 'r1'").run();
    const remaining = db.sqlite
      .prepare("SELECT COUNT(*) AS c FROM spelling_errors WHERE id = 'se1'")
      .get() as { c: number };
    expect(remaining.c).toBe(0);
  });
});
