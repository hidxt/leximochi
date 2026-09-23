import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { NotebookSource } from '@leximochi/types';
import { DATABASE } from '../../database/database.constants';
import type { DatabaseService } from '../../database/database.service';
import { userNotebook } from '../../database/schema';
import type {
  AddNotebookInput,
  NotebookCursor,
  NotebookEntryRecord,
  NotebookRepository,
} from '../../modules/learning/domain/notebook.repository';

/** 列表查询统一带上首条中文释义，供生词本列表展示 */
const ENTRY_SELECT = `
  SELECT n.word_id AS wordId,
         w.headword AS headword,
         n.note AS note,
         n.source AS source,
         n.added_at AS addedAt,
         (SELECT s.definition_zh FROM word_senses s
           WHERE s.word_id = n.word_id
           ORDER BY s.sort_order ASC, s.id ASC LIMIT 1) AS definitionZh
  FROM user_notebook n
  JOIN words w ON w.id = n.word_id`;

interface EntryRow {
  wordId: string;
  headword: string;
  note: string | null;
  source: string;
  addedAt: number;
  definitionZh: string | null;
}

@Injectable()
export class DrizzleNotebookRepository implements NotebookRepository {
  constructor(@Inject(DATABASE) private readonly database: DatabaseService) {}

  async add(input: AddNotebookInput): Promise<{ entry: NotebookEntryRecord; created: boolean }> {
    return this.database.withTransaction((tx) => {
      const inserted = tx
        .insert(userNotebook)
        .values({
          userId: input.userId,
          wordId: input.wordId,
          note: input.note,
          source: input.source,
          addedAt: input.addedAt,
        })
        // 幂等：同一用户重复加入同一个词不报错、不覆盖已有备注
        .onConflictDoNothing()
        .run();

      // 事务内必须用同步读取（async 方法会返回 Promise 而不是记录）
      const entry = this.readEntry(input.userId, input.wordId);
      if (!entry) throw new Error('生词本写入失败');
      return { entry, created: inserted.changes > 0 };
    });
  }

  async remove(userId: string, wordId: string): Promise<boolean> {
    const result = this.database.db
      .delete(userNotebook)
      .where(and(eq(userNotebook.userId, userId), eq(userNotebook.wordId, wordId)))
      .run();
    return result.changes > 0;
  }

  async findEntry(userId: string, wordId: string): Promise<NotebookEntryRecord | null> {
    return this.readEntry(userId, wordId);
  }

  private readEntry(userId: string, wordId: string): NotebookEntryRecord | null {
    const row = this.database.sqlite
      .prepare(`${ENTRY_SELECT} WHERE n.user_id = ? AND n.word_id = ?`)
      .get(userId, wordId) as EntryRow | undefined;
    return row ? toEntryRecord(row) : null;
  }

  async list(
    userId: string,
    page: { cursor?: NotebookCursor; limit: number },
  ): Promise<{ items: NotebookEntryRecord[]; nextCursor: NotebookCursor | null }> {
    const limit = page.limit;
    const cursor = page.cursor;
    const rows = (
      cursor
        ? this.database.sqlite
            .prepare(
              `${ENTRY_SELECT}
               WHERE n.user_id = ?
                 AND (n.added_at < ? OR (n.added_at = ? AND n.word_id > ?))
               ORDER BY n.added_at DESC, n.word_id ASC
               LIMIT ?`,
            )
            .all(userId, cursor.addedAt, cursor.addedAt, cursor.wordId, limit + 1)
        : this.database.sqlite
            .prepare(
              `${ENTRY_SELECT}
               WHERE n.user_id = ?
               ORDER BY n.added_at DESC, n.word_id ASC
               LIMIT ?`,
            )
            .all(userId, limit + 1)
    ) as EntryRow[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map(toEntryRecord),
      nextCursor: hasMore && last ? { addedAt: last.addedAt, wordId: last.wordId } : null,
    };
  }

  async count(userId: string): Promise<number> {
    const row = this.database.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(userNotebook)
      .where(eq(userNotebook.userId, userId))
      .get();
    return Number(row?.count ?? 0);
  }
}

function toEntryRecord(row: EntryRow): NotebookEntryRecord {
  return {
    wordId: row.wordId,
    headword: row.headword,
    definitionZh: row.definitionZh,
    note: row.note,
    // 库中取值受 schema enum 约束，这里仅做窄化
    source: row.source as NotebookSource,
    addedAt: Number(row.addedAt),
  };
}
