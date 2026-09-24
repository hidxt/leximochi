import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { ErrorCode } from '@leximochi/types';
import { AppError } from '../../common/errors/app-error';
import { DATABASE } from '../../database/database.constants';
import type { DatabaseService, DrizzleDb } from '../../database/database.service';
import { wordbookEntries, wordbooks, words } from '../../database/schema';
import type { ImportWordInput } from './import/import.types';
import { readExistingWord, writeNestedWordContent } from './import/word-content-writer';
import { mergeWords, normalizeHeadword, validateImportWord } from './import/word-import.service';

export type WordWriteMode = 'create' | 'replace' | 'merge';

export interface WriteWordInput {
  /** 目标词库；词条若已属于其他词库，会额外建立关联（词条是跨词库共享的） */
  wordbookId: string;
  word: ImportWordInput;
  mode: WordWriteMode;
}

export interface WriteWordResult {
  wordId: string;
  created: boolean;
}

export interface DeleteWordResult {
  deleted: boolean;
  affectedWordbookIds: string[];
}

/**
 * 单条词条写入（后台编辑用），与批量导入共用同一套内容写入实现（`word-content-writer`）。
 *
 * 语义差别只在调用入口：
 * - `writeWord({mode:'create'})`：词形已存在则 409，避免后台误建重复词条
 * - `writeWord({mode:'replace'|'merge'})`：按词形定位，已存在则更新（replace 整段替换，merge 取并集）
 * - `replaceWordById`：按主键定位，允许改名；新词形与其他词条冲突则 409
 *
 * 三个入口都会同步词库关联，并让受影响词库的 `version` 递增（供 Android 离线比对）。
 */
@Injectable()
export class WordWriteService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseService) {}

  async writeWord(input: WriteWordInput): Promise<WriteWordResult> {
    const canonical = this.validate(input.word);

    return this.database.withTransaction((tx) => {
      const now = Date.now();
      this.requireWordbook(tx, input.wordbookId);

      const byCanonical = tx
        .select({ id: words.id })
        .from(words)
        .where(eq(words.headwordCanonical, canonical))
        .get();
      if (input.mode === 'create' && byCanonical) {
        throw new AppError(ErrorCode.CONFLICT, '该词条已存在', 409);
      }

      const wordId = byCanonical?.id ?? randomUUID();
      const created = !byCanonical;
      const content =
        byCanonical && input.mode === 'merge'
          ? mergeWords(readExistingWord(tx, wordId), input.word)
          : input.word;

      this.writeRow(tx, { wordId, created, canonical, content, now });
      this.linkWordbook(tx, input.wordbookId, wordId, content);
      this.bumpWordbooks(tx, this.wordbookIdsOfWord(tx, wordId), now);
      return { wordId, created };
    });
  }

  /**
   * 按主键更新条目内容（后台编辑已有词条）：允许改词形，但不得与其他词条撞词形。
   * 只改词条本身与词典内容，不动词库关联（rank/tags 属于词库侧配置）。
   */
  async replaceWordById(wordId: string, word: ImportWordInput): Promise<WriteWordResult> {
    const canonical = this.validate(word);

    return this.database.withTransaction((tx) => {
      const now = Date.now();
      const existing = tx.select({ id: words.id }).from(words).where(eq(words.id, wordId)).get();
      if (!existing) {
        throw new AppError(ErrorCode.WORD_NOT_FOUND, '词条不存在', 404);
      }
      const conflict = tx
        .select({ id: words.id })
        .from(words)
        .where(eq(words.headwordCanonical, canonical))
        .get();
      if (conflict && conflict.id !== wordId) {
        throw new AppError(ErrorCode.CONFLICT, '已存在同名词条，无法改名', 409);
      }

      this.writeRow(tx, { wordId, created: false, canonical, content: word, now });
      this.bumpWordbooks(tx, this.wordbookIdsOfWord(tx, wordId), now);
      return { wordId, created: false };
    });
  }

  /** 删除词条（跨词库共享：会同时从所有引用它的词库中移除），并递增受影响词库版本 */
  async deleteWord(wordId: string): Promise<DeleteWordResult> {
    return this.database.withTransaction((tx) => {
      const now = Date.now();
      const existing = tx.select({ id: words.id }).from(words).where(eq(words.id, wordId)).get();
      if (!existing) return { deleted: false, affectedWordbookIds: [] };

      const affected = this.wordbookIdsOfWord(tx, wordId);
      tx.delete(words).where(eq(words.id, wordId)).run();
      this.bumpWordbooks(tx, affected, now);
      return { deleted: true, affectedWordbookIds: affected };
    });
  }

  /**
   * 写入音频 key（文件已由 StorageProvider 存好，这里只更新指针）。
   * 返回 false 表示词条不存在——调用方应删除已上传的文件，避免留下孤儿对象。
   */
  async setAudioKey(wordId: string, kind: 'uk' | 'us', audioKey: string): Promise<boolean> {
    return this.database.withTransaction((tx) => {
      const existing = tx.select({ id: words.id }).from(words).where(eq(words.id, wordId)).get();
      if (!existing) return false;
      const now = Date.now();
      tx.update(words)
        .set(
          kind === 'uk'
            ? { audioUkKey: audioKey, updatedAt: now }
            : { audioUsKey: audioKey, updatedAt: now },
        )
        .where(eq(words.id, wordId))
        .run();
      this.bumpWordbooks(tx, this.wordbookIdsOfWord(tx, wordId), now);
      return true;
    });
  }

  private validate(word: ImportWordInput): string {
    const reason = validateImportWord(word);
    if (reason) {
      throw new AppError(ErrorCode.IMPORT_PAYLOAD_INVALID, reason, 400);
    }
    return normalizeHeadword(word.headword);
  }

  private requireWordbook(tx: DrizzleDb, wordbookId: string): void {
    const target = tx.select({ id: wordbooks.id }).from(wordbooks).where(eq(wordbooks.id, wordbookId)).get();
    if (!target) {
      throw new AppError(ErrorCode.WORDBOOK_NOT_FOUND, '词库不存在', 404);
    }
  }

  private writeRow(
    tx: DrizzleDb,
    input: { wordId: string; created: boolean; canonical: string; content: ImportWordInput; now: number },
  ): void {
    const { wordId, created, canonical, content, now } = input;
    if (created) {
      tx.insert(words)
        .values({
          id: wordId,
          headword: content.headword.trim(),
          headwordCanonical: canonical,
          phoneticUk: content.phoneticUk ?? null,
          phoneticUs: content.phoneticUs ?? null,
          audioUkKey: content.audioUkKey ?? null,
          audioUsKey: content.audioUsKey ?? null,
          source: 'imported',
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } else {
      tx.update(words)
        .set({
          headword: content.headword.trim(),
          headwordCanonical: canonical,
          phoneticUk: content.phoneticUk ?? null,
          phoneticUs: content.phoneticUs ?? null,
          updatedAt: now,
        })
        .where(eq(words.id, wordId))
        .run();
    }
    writeNestedWordContent(tx, wordId, content, now);
  }

  private linkWordbook(
    tx: DrizzleDb,
    wordbookId: string,
    wordId: string,
    word: ImportWordInput,
  ): void {
    tx.delete(wordbookEntries)
      .where(and(eq(wordbookEntries.wordbookId, wordbookId), eq(wordbookEntries.wordId, wordId)))
      .run();
    tx.insert(wordbookEntries)
      .values({
        wordbookId,
        wordId,
        rank: word.rank ?? null,
        tagsJson: word.tags && word.tags.length > 0 ? JSON.stringify(word.tags) : null,
      })
      .run();
  }

  private wordbookIdsOfWord(tx: DrizzleDb, wordId: string): string[] {
    return tx
      .select({ wordbookId: wordbookEntries.wordbookId })
      .from(wordbookEntries)
      .where(eq(wordbookEntries.wordId, wordId))
      .all()
      .map((row) => row.wordbookId);
  }

  /** 重新统计词数并递增版本：版本变化是 Android 判断「是否需要重新下载词库」的依据 */
  private bumpWordbooks(tx: DrizzleDb, wordbookIds: string[], now: number): void {
    for (const wordbookId of new Set(wordbookIds)) {
      const row = tx.select().from(wordbooks).where(eq(wordbooks.id, wordbookId)).get();
      if (!row) continue;
      const count = tx
        .select({ count: sql<number>`COUNT(*)` })
        .from(wordbookEntries)
        .where(eq(wordbookEntries.wordbookId, wordbookId))
        .get();
      tx.update(wordbooks)
        .set({ wordCount: Number(count?.count ?? 0), version: row.version + 1, updatedAt: now })
        .where(eq(wordbooks.id, wordbookId))
        .run();
    }
  }
}
