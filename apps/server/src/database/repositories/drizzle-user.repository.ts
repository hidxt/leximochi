import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { ErrorCode, type PublicUser } from '@leximochi/types';
import { AppError } from '../../common/errors/app-error';
import { DATABASE } from '../database.constants';
import type { DatabaseService } from '../database.service';
import { permissions, rolePermissions, roles, userRoles, users } from '../schema';
import type {
  AdminUserFilter,
  AdminUserItem,
  AdminUserListResult,
  CreateUserInput,
  UserRecord,
  UserRepository,
} from '../../modules/users/domain/user.repository';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code.startsWith('SQLITE_CONSTRAINT')
  );
}

@Injectable()
export class DrizzleUserRepository implements UserRepository {
  constructor(@Inject(DATABASE) private readonly database: DatabaseService) {}

  async findById(id: string): Promise<UserRecord | null> {
    const row = this.database.db.select().from(users).where(eq(users.id, id)).get();
    return row ? toRecord(row) : null;
  }

  async findByUsernameCanonical(canonical: string): Promise<UserRecord | null> {
    const row = this.database.db
      .select()
      .from(users)
      .where(eq(users.usernameCanonical, canonical))
      .get();
    return row ? toRecord(row) : null;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const id = randomUUID();
    try {
      this.database.db
        .insert(users)
        .values({
          id,
          username: input.username,
          usernameCanonical: input.usernameCanonical,
          passwordHash: input.passwordHash,
          passwordAlgo: 'argon2id',
          passwordUpdatedAt: input.now,
          status: 'active',
          createdAt: input.now,
          updatedAt: input.now,
        })
        .run();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(ErrorCode.AUTH_USERNAME_TAKEN, '该用户名已被使用', 409);
      }
      throw error;
    }
    const created = await this.findById(id);
    if (!created) throw new AppError(ErrorCode.INTERNAL_ERROR, '创建用户失败', 500);
    return created;
  }

  async removeById(id: string): Promise<void> {
    this.database.db.delete(users).where(eq(users.id, id)).run();
  }

  async updatePassword(userId: string, passwordHash: string, now: number): Promise<void> {
    this.database.db
      .update(users)
      .set({ passwordHash, passwordAlgo: 'argon2id', passwordUpdatedAt: now, updatedAt: now })
      .where(eq(users.id, userId))
      .run();
  }

  async setStatus(
    userId: string,
    status: 'active' | 'banned',
    ctx: { reason: string | null; actorId: string | null; now: number },
  ): Promise<void> {
    this.database.db
      .update(users)
      .set({
        status,
        bannedReason: status === 'banned' ? ctx.reason : null,
        bannedAt: status === 'banned' ? ctx.now : null,
        bannedBy: status === 'banned' ? ctx.actorId : null,
        updatedAt: ctx.now,
      })
      .where(eq(users.id, userId))
      .run();
  }

  async touchLastLogin(userId: string, now: number): Promise<void> {
    this.database.db
      .update(users)
      .set({ lastLoginAt: now, updatedAt: now })
      .where(eq(users.id, userId))
      .run();
  }

  async listRoles(userId: string): Promise<string[]> {
    const rows = this.database.db
      .select({ key: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId))
      .all();
    return rows.map((row) => row.key);
  }

  async listPermissions(userId: string): Promise<string[]> {
    const rows = this.database.db
      .selectDistinct({ key: permissions.key })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(userRoles.userId, userId))
      .all();
    return rows.map((row) => row.key);
  }

  async toPublicUser(record: UserRecord): Promise<PublicUser> {
    return {
      id: record.id,
      username: record.username,
      status: record.status,
      roles: await this.listRoles(record.id),
      createdAt: record.createdAt,
    };
  }

  async listForAdmin(filter: AdminUserFilter): Promise<AdminUserListResult> {
    const limit = Math.min(Math.max(filter.limit, 1), 100);
    const cursor = decodeCursor(filter.cursor);
    const conditions = [];
    if (filter.status) conditions.push(eq(users.status, filter.status));
    if (filter.query) {
      const pattern = `%${escapeLike(filter.query.toLowerCase())}%`;
      conditions.push(
        sql`(lower(${users.username}) LIKE ${pattern} ESCAPE '\\' OR ${users.usernameCanonical} LIKE ${pattern} ESCAPE '\\')`,
      );
    }
    if (cursor) {
      conditions.push(
        or(
          lt(users.createdAt, cursor.createdAt),
          and(eq(users.createdAt, cursor.createdAt), lt(users.id, cursor.id)),
        )!,
      );
    }

    const rows = this.database.db
      .select()
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const rolesByUser = await this.rolesForUsers(page.map((row) => row.id));
    const last = page[page.length - 1];

    return {
      items: page.map((row) => ({
        id: row.id,
        username: row.username,
        status: row.status,
        roles: rolesByUser.get(row.id) ?? [],
        createdAt: row.createdAt,
        lastLoginAt: row.lastLoginAt,
      })),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async findAdminItemById(id: string): Promise<AdminUserItem | null> {
    const row = this.database.db.select().from(users).where(eq(users.id, id)).get();
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      status: row.status,
      roles: await this.listRoles(row.id),
      createdAt: row.createdAt,
      lastLoginAt: row.lastLoginAt,
    };
  }

  private async rolesForUsers(userIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (userIds.length === 0) return result;
    const rows = this.database.db
      .select({ userId: userRoles.userId, key: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(inArray(userRoles.userId, userIds))
      .all();
    for (const row of rows) {
      const list = result.get(row.userId) ?? [];
      list.push(row.key);
      result.set(row.userId, list);
    }
    return result;
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function encodeCursor(createdAt: number, id: string): string {
  return Buffer.from(`${createdAt}:${id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): { createdAt: number; id: string } | null {
  if (!cursor) return null;
  try {
    const [rawCreatedAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split(':');
    const createdAt = Number(rawCreatedAt);
    if (!Number.isFinite(createdAt) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function toRecord(row: typeof users.$inferSelect): UserRecord {
  return {
    id: row.id,
    username: row.username,
    usernameCanonical: row.usernameCanonical,
    passwordHash: row.passwordHash,
    passwordAlgo: row.passwordAlgo,
    status: row.status,
    bannedReason: row.bannedReason,
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt,
  };
}
