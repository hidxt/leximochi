import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const ACTOR_TYPES = ['user', 'admin', 'system', 'anonymous'] as const;

export type ActorType = (typeof ACTOR_TYPES)[number];

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorType: text('actor_type').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    result: text('result').notNull(),
    metadataJson: text('metadata_json'),
    requestId: text('request_id'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('audit_logs_action_idx').on(table.action, table.createdAt),
    index('audit_logs_actor_idx').on(table.actorUserId, table.createdAt),
    index('audit_logs_target_idx').on(table.targetType, table.targetId, table.createdAt),
  ],
);
