import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { DATABASE } from '../database.constants';
import type { DatabaseService } from '../database.service';
import { wordbooks } from '../schema';
import type {
  CreateWordbookInput,
  UpdateWordbookInput,
  WordbookRecord,
  WordbookRepository,
} from '../../modules/vocabulary/domain/wordbook.repository';

@Injectable()
export class DrizzleWordbookRepository implements WordbookRepository {
  constructor(@Inject(DATABASE) private readonly database: DatabaseService) {}

  async list(): Promise<WordbookRecord[]> {
    return this.database.db
      .select()
      .from(wordbooks)
      .orderBy(asc(wordbooks.isSystem), asc(wordbooks.name))
      .all()
      .map(toRecord);
  }

  async findByKey(key: string): Promise<WordbookRecord | null> {
    const row = this.database.db.select().from(wordbooks).where(eq(wordbooks.key, key)).get();
    return row ? toRecord(row) : null;
  }

  async findById(id: string): Promise<WordbookRecord | null> {
    const row = this.database.db.select().from(wordbooks).where(eq(wordbooks.id, id)).get();
    return row ? toRecord(row) : null;
  }

  async create(input: CreateWordbookInput): Promise<WordbookRecord> {
    const now = Date.now();
    const id = randomUUID();
    this.database.db
      .insert(wordbooks)
      .values({
        id,
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        language: input.language ?? 'en',
        isSystem: input.isSystem ? 1 : 0,
        version: 1,
        wordCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const created = await this.findById(id);
    if (!created) throw new Error('词库写入失败');
    return created;
  }

  async update(id: string, input: UpdateWordbookInput): Promise<WordbookRecord | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    this.database.db
      .update(wordbooks)
      .set({
        name: input.name ?? existing.name,
        description: input.description === undefined ? existing.description : input.description,
        language: input.language ?? existing.language,
        isSystem: input.isSystem === undefined ? (existing.isSystem ? 1 : 0) : input.isSystem ? 1 : 0,
        // 元数据变化不递增 version：version 只表达词条内容变化，避免客户端无谓重新下载
        updatedAt: Date.now(),
      })
      .where(eq(wordbooks.id, id))
      .run();
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = this.database.db.delete(wordbooks).where(eq(wordbooks.id, id)).run();
    return result.changes > 0;
  }
}

function toRecord(row: typeof wordbooks.$inferSelect): WordbookRecord {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    language: row.language,
    isSystem: row.isSystem === 1,
    version: row.version,
    wordCount: row.wordCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
