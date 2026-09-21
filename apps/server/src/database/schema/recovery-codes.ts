import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const recoveryCodes = sqliteTable(
  'recovery_codes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    createdAt: integer('created_at').notNull(),
    usedAt: integer('used_at'),
    usedIp: text('used_ip'),
  },
  (table) => [index('recovery_codes_user_idx').on(table.userId, table.usedAt)],
);
