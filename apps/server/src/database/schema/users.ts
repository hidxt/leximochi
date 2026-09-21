import { foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    usernameCanonical: text('username_canonical').notNull(),
    passwordHash: text('password_hash').notNull(),
    passwordAlgo: text('password_algo').notNull().default('argon2id'),
    passwordUpdatedAt: integer('password_updated_at').notNull(),
    status: text('status', { enum: ['active', 'banned'] })
      .notNull()
      .default('active'),
    bannedReason: text('banned_reason'),
    bannedAt: integer('banned_at'),
    bannedBy: text('banned_by'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    lastLoginAt: integer('last_login_at'),
  },
  (table) => [
    uniqueIndex('users_username_canonical_unique').on(table.usernameCanonical),
    index('users_status_idx').on(table.status),
    // 自引用外键用 foreignKey() 声明，避免在表初始化表达式内引用自身导致的类型循环
    foreignKey({
      name: 'users_banned_by_fk',
      columns: [table.bannedBy],
      foreignColumns: [table.id],
    }).onDelete('set null'),
  ],
);
