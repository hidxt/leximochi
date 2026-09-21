import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { DATABASE } from '../database.constants';
import type { DatabaseService } from '../database.service';
import { sessions } from '../schema';
import type {
  CreateSessionInput,
  SessionRecord,
  SessionRepository,
} from '../../modules/auth/domain/session.repository';

@Injectable()
export class DrizzleSessionRepository implements SessionRepository {
  constructor(@Inject(DATABASE) private readonly database: DatabaseService) {}

  async create(input: CreateSessionInput): Promise<void> {
    this.database.db
      .insert(sessions)
      .values({
        id: input.id,
        userId: input.userId,
        familyId: input.familyId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
        revokedReason: null,
        userAgent: input.userAgent,
        ip: input.ip,
        createdAt: input.now,
        lastUsedAt: input.now,
      })
      .run();
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const row = this.database.db.select().from(sessions).where(eq(sessions.id, id)).get();
    return row ? toRecord(row) : null;
  }

  async findByRefreshHash(hash: string): Promise<SessionRecord | null> {
    const row = this.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, hash))
      .get();
    return row ? toRecord(row) : null;
  }

  async touch(sessionId: string, now: number): Promise<void> {
    this.database.db
      .update(sessions)
      .set({ lastUsedAt: now })
      .where(eq(sessions.id, sessionId))
      .run();
  }

  async revoke(sessionId: string, reason: string, now: number): Promise<boolean> {
    const result = this.database.sqlite
      .prepare(
        `UPDATE sessions SET revoked_at = ?, revoked_reason = ?
         WHERE id = ? AND revoked_at IS NULL`,
      )
      .run(now, reason, sessionId);
    return result.changes === 1;
  }

  async revokeFamily(familyId: string, reason: string, now: number): Promise<void> {
    this.database.sqlite
      .prepare(
        `UPDATE sessions SET revoked_at = ?, revoked_reason = ?
         WHERE family_id = ? AND revoked_at IS NULL`,
      )
      .run(now, reason, familyId);
  }

  async revokeAllForUser(userId: string, reason: string, now: number): Promise<void> {
    this.database.sqlite
      .prepare(
        `UPDATE sessions SET revoked_at = ?, revoked_reason = ?
         WHERE user_id = ? AND revoked_at IS NULL`,
      )
      .run(now, reason, userId);
  }

  async listActive(userId: string): Promise<SessionRecord[]> {
    return this.database.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, Date.now()),
        ),
      )
      .orderBy(desc(sessions.createdAt))
      .all()
      .map(toRecord);
  }
}

function toRecord(row: typeof sessions.$inferSelect): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    familyId: row.familyId,
    refreshTokenHash: row.refreshTokenHash,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
    userAgent: row.userAgent,
    ip: row.ip,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}
