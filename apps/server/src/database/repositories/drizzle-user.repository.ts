import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { ErrorCode, type PublicUser } from '@leximochi/types';
import { AppError } from '../../common/errors/app-error';
import { DATABASE } from '../database.constants';
import type { DatabaseService } from '../database.service';
import { permissions, rolePermissions, roles, userRoles, users } from '../schema';
import type {
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
