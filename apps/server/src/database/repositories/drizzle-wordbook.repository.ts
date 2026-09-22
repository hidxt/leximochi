import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DATABASE } from '../database.constants';
import type { DatabaseService } from '../database.service';
import { wordbooks } from '../schema';
import type {
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
