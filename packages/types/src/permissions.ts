export const RoleKey = {
  User: 'user',
  Admin: 'admin',
} as const;

export type RoleKey = (typeof RoleKey)[keyof typeof RoleKey];

export const Permission = {
  AdminUsersRead: 'admin.users.read',
  AdminUsersBan: 'admin.users.ban',
  AdminAuditRead: 'admin.audit.read',
  AdminWordbooksRead: 'admin.wordbooks.read',
  /** 词库增删改（删除属高风险操作，需显式二次确认） */
  AdminWordbooksWrite: 'admin.wordbooks.write',
  AdminWordsRead: 'admin.words.read',
  /** 词条增删改（删除属高风险操作，需显式二次确认） */
  AdminWordsWrite: 'admin.words.write',
  AdminWordsImport: 'admin.words.import',
  AdminWordsAudio: 'admin.words.audio',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];
