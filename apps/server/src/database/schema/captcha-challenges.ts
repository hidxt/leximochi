import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const captchaChallenges = sqliteTable(
  'captcha_challenges',
  {
    jti: text('jti').primaryKey(),
    answerHash: text('answer_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    consumedAt: integer('consumed_at'),
    ip: text('ip'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('captcha_challenges_expires_idx').on(table.expiresAt)],
);
