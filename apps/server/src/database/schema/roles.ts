import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  isSystem: integer('is_system').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const permissions = sqliteTable('permissions', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  description: text('description'),
  createdAt: integer('created_at').notNull(),
});

export const rolePermissions = sqliteTable(
  'role_permissions',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: text('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const userRoles = sqliteTable(
  'user_roles',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    grantedAt: integer('granted_at').notNull(),
    grantedBy: text('granted_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index('user_roles_role_idx').on(table.roleId),
  ],
);
