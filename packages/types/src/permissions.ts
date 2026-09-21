export const RoleKey = {
  User: 'user',
  Admin: 'admin',
} as const;

export type RoleKey = (typeof RoleKey)[keyof typeof RoleKey];

export const Permission = {
  AdminUsersRead: 'admin.users.read',
  AdminUsersBan: 'admin.users.ban',
  AdminAuditRead: 'admin.audit.read',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];
