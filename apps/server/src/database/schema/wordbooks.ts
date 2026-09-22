import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * 词库为纯数据：CET-4 / CET-6 只是数据行，业务逻辑不得按 key 分支。
 * `version` 随内容变化递增，供 Android 判断是否需要重新下载词库。
 */
export const wordbooks = sqliteTable(
  'wordbooks',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    language: text('language').notNull().default('en'),
    isSystem: integer('is_system').notNull().default(0),
    version: integer('version').notNull().default(1),
    wordCount: integer('word_count').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [uniqueIndex('wordbooks_key_unique').on(table.key)],
);

/** 词条全局共享：同一个单词可同时属于多个词库 */
export const words = sqliteTable(
  'words',
  {
    id: text('id').primaryKey(),
    headword: text('headword').notNull(),
    headwordCanonical: text('headword_canonical').notNull(),
    phoneticUk: text('phonetic_uk'),
    phoneticUs: text('phonetic_us'),
    /** 音频只存 StorageProvider 的 key，业务代码不得拼接绝对路径 */
    audioUkKey: text('audio_uk_key'),
    audioUsKey: text('audio_us_key'),
    source: text('source', { enum: ['dictionary', 'imported'] })
      .notNull()
      .default('dictionary'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [uniqueIndex('words_headword_canonical_unique').on(table.headwordCanonical)],
);

export const wordbookEntries = sqliteTable(
  'wordbook_entries',
  {
    wordbookId: text('wordbook_id')
      .notNull()
      .references(() => wordbooks.id, { onDelete: 'cascade' }),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    /** 词库内教学顺序 */
    rank: integer('rank'),
    /** JSON 数组字符串，如 ["高频","熟词僻义"] */
    tagsJson: text('tags_json'),
  },
  (table) => [
    primaryKey({ columns: [table.wordbookId, table.wordId] }),
    index('wordbook_entries_rank_idx').on(table.wordbookId, table.rank),
  ],
);
