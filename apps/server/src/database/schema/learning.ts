import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './users';
import { words } from './wordbooks';

/**
 * 每个用户对每个单词的 SM-2 学习状态（调度参数的唯一存储处）。
 * 服务端权威：客户端不得提交 easeFactor / intervalDays / dueAt。
 */
export const userWordStates = sqliteTable(
  'user_word_states',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['new', 'learning', 'review', 'mastered'] })
      .notNull()
      .default('new'),
    easeFactor: real('ease_factor').notNull().default(2.5),
    intervalDays: real('interval_days').notNull().default(0),
    repetitions: integer('repetitions').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    dueAt: integer('due_at'),
    lastReviewedAt: integer('last_reviewed_at'),
    firstLearnedAt: integer('first_learned_at'),
    totalReviews: integer('total_reviews').notNull().default(0),
    correctReviews: integer('correct_reviews').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.wordId] }),
    index('user_word_states_due_idx').on(table.userId, table.dueAt),
    index('user_word_states_status_idx').on(table.userId, table.status),
  ],
);

/**
 * 每次复习的全量留痕：包含评分后的调度参数，便于未来无损迁移到 FSRS。
 * `event_id` 唯一约束是幂等的最后防线（网络重试/离线补传不得重复计分）。
 */
export const reviewLogs = sqliteTable(
  'review_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    eventId: text('event_id').notNull(),
    questionType: text('question_type').notNull(),
    answerRaw: text('answer_raw').notNull(),
    isCorrect: integer('is_correct').notNull(),
    rating: text('rating').notNull(),
    durationMs: integer('duration_ms').notNull(),
    answeredAt: integer('answered_at').notNull(),
    clientAnsweredAt: integer('client_answered_at'),
    easeFactorAfter: real('ease_factor_after').notNull(),
    intervalDaysAfter: real('interval_days_after').notNull(),
    repetitionsAfter: integer('repetitions_after').notNull(),
    dueAtAfter: integer('due_at_after').notNull(),
    source: text('source').notNull().default('web'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('review_logs_event_id_unique').on(table.eventId),
    index('review_logs_user_time_idx').on(table.userId, table.answeredAt),
    index('review_logs_user_word_idx').on(table.userId, table.wordId),
  ],
);

export const userNotebook = sqliteTable(
  'user_notebook',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    note: text('note'),
    source: text('source', { enum: ['manual', 'from_review', 'from_listening'] })
      .notNull()
      .default('manual'),
    addedAt: integer('added_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.wordId] }),
    index('user_notebook_added_idx').on(table.userId, table.addedAt),
  ],
);

/** 错拼分类记录：用于提高该词后续复习权重 */
export const spellingErrors = sqliteTable(
  'spelling_errors',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    reviewLogId: text('review_log_id')
      .notNull()
      .references(() => reviewLogs.id, { onDelete: 'cascade' }),
    expected: text('expected').notNull(),
    actual: text('actual').notNull(),
    /** 逗号分隔的错拼类型（missing_letter / duplicate_letter / order_error / wrong_letter） */
    errorTypes: text('error_types').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('spelling_errors_user_word_idx').on(table.userId, table.wordId, table.createdAt)],
);
