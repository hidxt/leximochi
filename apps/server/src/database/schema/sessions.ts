import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const REVOKE_REASONS = [
  'logout',
  'rotated',
  'reuse_detected',
  'password_changed',
  'recovery_used',
  'banned',
  'logout_all',
] as const;

export type RevokeReason = (typeof REVOKE_REASONS)[number];

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: text('family_id').notNull(),
    refreshTokenHash: text('refresh_token_hash').notNull().unique(),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
    revokedReason: text('revoked_reason'),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: integer('created_at').notNull(),
    lastUsedAt: integer('last_used_at'),
  },
  (table) => [
    index('sessions_user_idx').on(table.userId),
    index('sessions_family_idx').on(table.familyId),
    index('sessions_expires_idx').on(table.expiresAt),
  ],
);
