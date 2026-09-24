import { randomUUID } from 'node:crypto';
import { Permission, RoleKey } from '@leximochi/types';
import { eq } from 'drizzle-orm';
import type { DatabaseService } from '../database.service';
import { permissions, rolePermissions, roles } from '../schema';

interface RoleDefinition {
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: RoleKey.User,
    name: '普通用户',
    description: '学习与宠物养成的基础身份',
    permissions: [],
  },
  {
    key: RoleKey.Admin,
    name: '管理员',
    description: '管理后台身份',
    permissions: [
      Permission.AdminUsersRead,
      Permission.AdminUsersBan,
      Permission.AdminAuditRead,
      Permission.AdminWordbooksRead,
      Permission.AdminWordbooksWrite,
      Permission.AdminWordsRead,
      Permission.AdminWordsWrite,
      Permission.AdminWordsImport,
      Permission.AdminWordsAudio,
    ],
  },
];

export function seedSystemRoles(db: DatabaseService): void {
  const now = Date.now();
  db.withTransaction((tx) => {
    for (const role of ROLE_DEFINITIONS) {
      tx.insert(roles)
        .values({
          id: randomUUID(),
          key: role.key,
          name: role.name,
          description: role.description,
          isSystem: 1,
          createdAt: now,
        })
        .onConflictDoNothing({ target: roles.key })
        .run();
    }

    const permissionKeys = [...new Set(ROLE_DEFINITIONS.flatMap((role) => role.permissions))];
    for (const key of permissionKeys) {
      tx.insert(permissions)
        .values({ id: randomUUID(), key, description: key, createdAt: now })
        .onConflictDoNothing({ target: permissions.key })
        .run();
    }

    for (const role of ROLE_DEFINITIONS) {
      const roleRow = tx.select().from(roles).where(eq(roles.key, role.key)).get();
      if (!roleRow) {
        throw new Error(`种子角色缺失: ${role.key}`);
      }
      for (const permissionKey of role.permissions) {
        const permissionRow = tx
          .select()
          .from(permissions)
          .where(eq(permissions.key, permissionKey))
          .get();
        if (!permissionRow) {
          throw new Error(`种子权限缺失: ${permissionKey}`);
        }
        tx.insert(rolePermissions)
          .values({ roleId: roleRow.id, permissionId: permissionRow.id })
          .onConflictDoNothing()
          .run();
      }
    }
  });
}
