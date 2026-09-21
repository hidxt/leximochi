import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { AuditLogPage } from '@leximochi/types';
import { DATABASE } from '../database.constants';
import type { DatabaseService } from '../database.service';
import { auditLogs } from '../schema';
import type { AuditQuery, AuditRecordInput, AuditRepository } from '../../modules/audit/domain/audit.repository';

@Injectable()
export class DrizzleAuditRepository implements AuditRepository {
  constructor(@Inject(DATABASE) private readonly database: DatabaseService) {}

  async insert(input: AuditRecordInput & { id: string; createdAt: number }): Promise<void> {
    this.database.db
      .insert(auditLogs)
      .values({
        id: input.id,
        actorUserId: input.actorUserId,
        actorType: input.actorType,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        result: input.result,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
        requestId: input.requestId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        createdAt: input.createdAt,
      })
      .run();
  }

  async list(query: AuditQuery): Promise<AuditLogPage> {
    const limit = Math.min(Math.max(query.limit, 1), 100);
    const filters = [] as ReturnType<typeof eq>[];
    if (query.action) filters.push(eq(auditLogs.action, query.action));
    if (query.actorUserId) filters.push(eq(auditLogs.actorUserId, query.actorUserId));
    if (query.targetId) filters.push(eq(auditLogs.targetId, query.targetId));
    if (query.targetType) filters.push(eq(auditLogs.targetType, query.targetType));

    const cursor = decodeCursor(query.cursor);

    const rows = this.database.db
      .select()
      .from(auditLogs)
      .where(
        cursor
          ? and(
              ...filters,
              or(
                lt(auditLogs.createdAt, cursor.createdAt),
                and(eq(auditLogs.createdAt, cursor.createdAt), lt(auditLogs.id, cursor.id)),
              ),
            )
          : filters.length > 0
            ? and(...filters)
            : undefined,
      )
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        actorType: row.actorType as 'user' | 'admin' | 'system' | 'anonymous',
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        result: row.result as 'success' | 'failure',
        createdAt: row.createdAt,
      })),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }
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
