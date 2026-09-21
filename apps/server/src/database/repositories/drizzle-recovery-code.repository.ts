import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DATABASE } from '../database.constants';
import type { DatabaseService } from '../database.service';
import { recoveryCodes } from '../schema';
import type { RecoveryCodeRepository } from '../../modules/users/domain/recovery-code.repository';

@Injectable()
export class DrizzleRecoveryCodeRepository implements RecoveryCodeRepository {
  constructor(@Inject(DATABASE) private readonly database: DatabaseService) {}

  async replaceAllForUser(userId: string, codeHashes: string[], now: number): Promise<void> {
    this.database.withTransaction((tx) => {
      tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId)).run();
      for (const codeHash of codeHashes) {
        tx.insert(recoveryCodes)
          .values({
            id: randomUUID(),
            userId,
            codeHash,
            createdAt: now,
            usedAt: null,
            usedIp: null,
          })
          .run();
      }
    });
  }

  async consume(userId: string, codeId: string, now: number, ip: string | null): Promise<boolean> {
    // 条件更新：并发或重放时只有一次能把 used_at 从 NULL 改成时间戳
    const result = this.database.sqlite
      .prepare(
        `UPDATE recovery_codes SET used_at = ?, used_ip = ?
         WHERE id = ? AND user_id = ? AND used_at IS NULL`,
      )
      .run(now, ip, codeId, userId);
    return result.changes === 1;
  }

  async listUnused(userId: string): Promise<Array<{ id: string; codeHash: string }>> {
    return this.database.db
      .select({ id: recoveryCodes.id, codeHash: recoveryCodes.codeHash })
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)))
      .all();
  }

  async countUnused(userId: string): Promise<number> {
    const row = this.database.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)))
      .get();
    return Number(row?.count ?? 0);
  }
}
