import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const ATTEMPT_KINDS = ['login', 'register', 'refresh', 'recovery', 'captcha'] as const;

export type AttemptKind = (typeof ATTEMPT_KINDS)[number];

export const authAttempts = sqliteTable(
  'auth_attempts',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    usernameCanonical: text('username_canonical'),
    ip: text('ip'),
    success: integer('success').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('auth_attempts_user_idx').on(table.kind, table.usernameCanonical, table.createdAt),
    index('auth_attempts_ip_idx').on(table.kind, table.ip, table.createdAt),
    index('auth_attempts_created_idx').on(table.createdAt),
  ],
);
