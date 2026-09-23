import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { words } from './wordbooks';

/** 词义（含「四六级常考含义」） */
export const wordSenses = sqliteTable(
  'word_senses',
  {
    id: text('id').primaryKey(),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    partOfSpeech: text('part_of_speech'),
    definitionZh: text('definition_zh').notNull(),
    definitionEn: text('definition_en'),
    examMeaning: text('exam_meaning'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [index('word_senses_word_idx').on(table.wordId, table.sortOrder)],
);

export const wordExamples = sqliteTable(
  'word_examples',
  {
    id: text('id').primaryKey(),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    senseId: text('sense_id').references(() => wordSenses.id, { onDelete: 'set null' }),
    textEn: text('text_en').notNull(),
    textZh: text('text_zh').notNull(),
    audioKey: text('audio_key'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [index('word_examples_word_idx').on(table.wordId, table.sortOrder)],
);

/** 常见短语与常见搭配复用同一张表，用 kind 区分 */
export const wordPhrases = sqliteTable(
  'word_phrases',
  {
    id: text('id').primaryKey(),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['phrase', 'collocation'] })
      .notNull()
      .default('phrase'),
    text: text('text').notNull(),
    translation: text('translation').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [index('word_phrases_word_idx').on(table.wordId, table.kind, table.sortOrder)],
);

export const wordForms = sqliteTable(
  'word_forms',
  {
    id: text('id').primaryKey(),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    formType: text('form_type').notNull(),
    value: text('value').notNull(),
  },
  (table) => [index('word_forms_word_idx').on(table.wordId)],
);

/** 近义/反义/易混；目标词可尚未入库，故允许只存文本 */
export const wordRelations = sqliteTable(
  'word_relations',
  {
    id: text('id').primaryKey(),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    relationType: text('relation_type', { enum: ['synonym', 'antonym', 'confusable', 'derived'] }).notNull(),
    targetWordId: text('target_word_id').references(() => words.id, { onDelete: 'set null' }),
    targetText: text('target_text'),
  },
  (table) => [index('word_relations_word_idx').on(table.wordId, table.relationType)],
);

/**
 * AI 生成内容独立成表：只允许补充记忆技巧、用法解释、易混词比较与更多例句，
 * 永不写入 words / word_senses / word_examples，避免污染可靠词典数据。
 */
export const wordAiNotes = sqliteTable(
  'word_ai_notes',
  {
    id: text('id').primaryKey(),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    memoryTip: text('memory_tip'),
    usageNote: text('usage_note'),
    confusableNote: text('confusable_note'),
    extraExamplesJson: text('extra_examples_json'),
    provider: text('provider'),
    model: text('model'),
    generatedAt: integer('generated_at'),
  },
  (table) => [uniqueIndex('word_ai_notes_word_unique').on(table.wordId)],
);
