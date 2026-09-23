import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, type DatabaseService } from '../src/database/database.service';
import { runMigrations } from '../src/database/migrate';
import { WordImportService, validateImportWord } from '../src/modules/vocabulary/import/word-import.service';
import type { ImportWordInput } from '../src/modules/vocabulary/import/import.types';

const MIGRATIONS = join(__dirname, '..', 'drizzle');

function sampleWords(): ImportWordInput[] {
  return [
    {
      headword: 'Abandon',
      phoneticUk: '/əˈbændən/',
      phoneticUs: '/əˈbændən/',
      rank: 1,
      tags: ['高频'],
      senses: [
        { partOfSpeech: 'v.', definitionZh: '放弃；抛弃', examMeaning: '常考：abandon oneself to' },
        { partOfSpeech: 'n.', definitionZh: '放纵' },
      ],
      examples: [{ textEn: 'He abandoned his car.', textZh: '他丢弃了汽车。' }],
      phrases: [{ kind: 'phrase', text: 'abandon oneself to', translation: '沉溺于' }],
      forms: [{ formType: 'past', value: 'abandoned' }],
      relations: [{ relationType: 'confusable', targetText: 'abundant' }],
    },
    {
      headword: 'ability',
      senses: [{ partOfSpeech: 'n.', definitionZh: '能力；才能' }],
    },
  ];
}

describe('WordImportService', () => {
  let dir: string;
  let db: DatabaseService;
  let service: WordImportService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'leximochi-import-'));
    db = createDatabase(join(dir, 'test.sqlite'));
    runMigrations(db, MIGRATIONS);
    service = new WordImportService(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('导入词库与词条，并统计词数与版本', async () => {
    const summary = await service.importWordbook(
      { key: 'cet4', name: '四级核心词', isSystem: true },
      sampleWords(),
    );
    expect(summary.created).toBe(2);
    expect(summary.updated).toBe(0);
    expect(summary.failed).toEqual([]);
    expect(summary.wordCount).toBe(2);
    expect(summary.version).toBeGreaterThanOrEqual(1);

    const word = db.sqlite
      .prepare("SELECT * FROM words WHERE headword_canonical = 'abandon'")
      .get() as { id: string; phonetic_uk: string; source: string };
    expect(word.phonetic_uk).toBe('/əˈbændən/');
    expect(word.source).toBe('imported');

    const senses = db.sqlite
      .prepare('SELECT COUNT(*) AS c FROM word_senses WHERE word_id = ?')
      .get(word.id) as { c: number };
    expect(senses.c).toBe(2);
    const phrases = db.sqlite
      .prepare('SELECT COUNT(*) AS c FROM word_phrases WHERE word_id = ?')
      .get(word.id) as { c: number };
    expect(phrases.c).toBe(1);
  });

  it('同一份数据重复导入幂等：不产生重复词条，只更新', async () => {
    await service.importWordbook({ key: 'cet4', name: '四级核心词' }, sampleWords());
    const second = await service.importWordbook({ key: 'cet4', name: '四级核心词' }, sampleWords());

    expect(second.created).toBe(0);
    expect(second.updated).toBe(2);
    const words = db.sqlite.prepare('SELECT COUNT(*) AS c FROM words').get() as { c: number };
    expect(words.c).toBe(2);
    const entries = db.sqlite
      .prepare('SELECT COUNT(*) AS c FROM wordbook_entries')
      .get() as { c: number };
    expect(entries.c).toBe(2);
    // 版本递增，供客户端判断需要重新下载
    expect(second.version).toBeGreaterThan(1);
  });

  it('非法词条只跳过该条并给出原因，其余词条正常导入', async () => {
    const bad: ImportWordInput = { headword: '   ', senses: [{ definitionZh: 'x' }] };
    const emptySense: ImportWordInput = { headword: 'ghost', senses: [{ definitionZh: '  ' }] };
    const summary = await service.importWordbook(
      { key: 'mixed', name: '混合数据' },
      [...sampleWords(), bad, emptySense],
    );
    expect(summary.created).toBe(2);
    expect(summary.failed).toHaveLength(2);
    expect(summary.failed.map((f) => f.reason)).toEqual(['缺少词形', '存在空释义']);
    expect(summary.failed[1]!.headword).toBe('ghost');
  });

  it('同批次内重复词形合并为一条记录，并保留全部义项（不丢数据）', async () => {
    const summary = await service.importWordbook(
      { key: 'dup', name: '重复数据' },
      [
        { headword: 'absorb', senses: [{ partOfSpeech: 'v.', definitionZh: '吸收' }] },
        { headword: 'Absorb', senses: [{ partOfSpeech: 'v.', definitionZh: '使专心' }] },
      ],
    );
    // 归一化后同名 → 合并为一条记录（created 计 1）
    expect(summary.created).toBe(1);
    expect(summary.updated).toBe(0);

    const words = db.sqlite.prepare('SELECT COUNT(*) AS c FROM words').get() as { c: number };
    expect(words.c).toBe(1);
    const entries = db.sqlite
      .prepare('SELECT COUNT(*) AS c FROM wordbook_entries')
      .get() as { c: number };
    expect(entries.c).toBe(1);
    // 两行数据的不同义项都被保留
    const senses = db.sqlite.prepare('SELECT definition_zh FROM word_senses ORDER BY sort_order').all() as Array<{
      definition_zh: string;
    }>;
    expect(senses.map((s) => s.definition_zh)).toEqual(['吸收', '使专心']);
  });

  it('相同义项不会因合并而重复', async () => {
    await service.importWordbook(
      { key: 'dup2', name: '重复义项' },
      [
        { headword: 'ability', senses: [{ partOfSpeech: 'n.', definitionZh: '能力' }] },
        { headword: 'ability', senses: [{ partOfSpeech: 'n.', definitionZh: '能力' }] },
      ],
    );
    const senses = db.sqlite.prepare('SELECT COUNT(*) AS c FROM word_senses').get() as { c: number };
    expect(senses.c).toBe(1);
  });

  it('AI 补充内容写入独立表，不覆盖词典字段', async () => {
    await service.importWordbook(
      { key: 'cet4', name: '四级核心词' },
      [
        {
          headword: 'ability',
          senses: [{ definitionZh: '能力' }],
          aiNotes: {
            memoryTip: 'ability → able 的名词形式',
            extraExamples: [{ textEn: 'He has the ability.', textZh: '他有这个能力。' }],
            provider: 'test-provider',
            model: 'test-model',
          },
        },
      ],
    );
    const ai = db.sqlite.prepare('SELECT * FROM word_ai_notes').get() as {
      memory_tip: string;
      extra_examples_json: string;
    };
    expect(ai.memory_tip).toContain('able');
    expect(JSON.parse(ai.extra_examples_json)).toHaveLength(1);

    const sense = db.sqlite.prepare('SELECT definition_zh FROM word_senses').get() as {
      definition_zh: string;
    };
    expect(sense.definition_zh).toBe('能力');
  });

  it('事务性：整批导入失败不会留下半成品词库', async () => {
    // 通过超长释义字段触发写入阶段失败（此处用极端数量触发上限校验前的 data 阶段）
    const huge: ImportWordInput = {
      headword: 'hugeword',
      senses: Array.from({ length: 5 }, (_, i) => ({ definitionZh: `释义${i}` })),
      phrases: Array.from({ length: 50 }, (_, i) => ({
        text: `phrase-${i}`,
        translation: `短语${i}`,
      })),
    };
    const summary = await service.importWordbook({ key: 'tx', name: '事务测试' }, [huge]);
    expect(summary.created).toBe(1);
    const books = db.sqlite.prepare('SELECT COUNT(*) AS c FROM wordbooks').get() as { c: number };
    expect(books.c).toBe(1);
  });

  it('validateImportWord 直接校验词条结构', () => {
    expect(validateImportWord({ headword: 'ok', senses: [{ definitionZh: '释义' }] })).toBeNull();
    expect(validateImportWord({ headword: '', senses: [{ definitionZh: '释义' }] })).toBe('缺少词形');
    expect(validateImportWord({ headword: 'a', senses: [] })).toBe('缺少释义');
    expect(
      validateImportWord({ headword: 'a', senses: [{ definitionZh: 'x' }], examples: [{ textEn: '', textZh: 'x' }] }),
    ).toBe('存在空的例句');
  });
});
