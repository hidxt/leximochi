import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  wordAiNotes,
  wordExamples,
  wordForms,
  wordPhrases,
  wordRelations,
  wordSenses,
  wordbookEntries,
  wordbooks,
  words,
} from '../../../database/schema';
import { DATABASE } from '../../../database/database.constants';
import type { DatabaseService, DrizzleDb } from '../../../database/database.service';
import type {
  ImportFailure,
  ImportSummary,
  ImportWordInput,
  ImportWordbookInput,
} from './import.types';

const MAX_SENSES_PER_WORD = 30;
const MAX_EXAMPLES_PER_WORD = 30;
const MAX_PHRASES_PER_WORD = 50;
const MAX_FORMS_PER_WORD = 20;
const MAX_RELATIONS_PER_WORD = 50;

/**
 * 词库批量导入。
 *
 * - 整体在一个事务内完成：任一步失败都不会留下半成品词库
 * - 按 `headwordCanonical` 幂等 upsert：同一份数据重复导入结果一致，不会产生重复词条
 * - 单个词条校验失败只跳过该词条并记录原因，不影响其余词条（返回逐条结果）
 * - 词典字段（`words`/`word_senses`/…）与 AI 补充（`word_ai_notes`）分别写入，互不覆盖
 */
@Injectable()
export class WordImportService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseService) {}

  async importWordbook(
    input: ImportWordbookInput,
    items: ImportWordInput[],
  ): Promise<ImportSummary> {
    const failures: ImportFailure[] = [];
    const grouped = new Map<string, ImportWordInput>();

    items.forEach((word, index) => {
      const reason = validateImportWord(word);
      if (reason) {
        failures.push({ index, headword: word.headword ?? null, reason });
        return;
      }
      const canonical = normalizeHeadword(word.headword);
      const existing = grouped.get(canonical);
      // 数据源里同一单词可能有多行（不同词性/义项），合并为一条记录，避免后写覆盖前写
      grouped.set(canonical, existing ? mergeWords(existing, word) : word);
    });

    const valid = [...grouped.entries()].map(([canonical, word]) => ({ word, canonical }));

    return this.database.withTransaction((tx) => {
      const now = Date.now();
      const book = upsertWordbook(tx, input, now);

      let created = 0;
      let updated = 0;

      for (const entry of valid) {
        const existing = tx
          .select({ id: words.id })
          .from(words)
          .where(eq(words.headwordCanonical, entry.canonical))
          .get();

        const wordId = existing?.id ?? randomUUID();
        if (existing) {
          tx.update(words)
            .set({
              headword: entry.word.headword.trim(),
              phoneticUk: entry.word.phoneticUk ?? null,
              phoneticUs: entry.word.phoneticUs ?? null,
              audioUkKey: entry.word.audioUkKey ?? null,
              audioUsKey: entry.word.audioUsKey ?? null,
              updatedAt: now,
            })
            .where(eq(words.id, wordId))
            .run();
          updated += 1;
        } else {
          tx.insert(words)
            .values({
              id: wordId,
              headword: entry.word.headword.trim(),
              headwordCanonical: entry.canonical,
              phoneticUk: entry.word.phoneticUk ?? null,
              phoneticUs: entry.word.phoneticUs ?? null,
              audioUkKey: entry.word.audioUkKey ?? null,
              audioUsKey: entry.word.audioUsKey ?? null,
              source: 'imported',
              createdAt: now,
              updatedAt: now,
            })
            .run();
          created += 1;
        }

        // 词典数据整段替换：导入是「以来源为准」的全量覆盖
        tx.delete(wordSenses).where(eq(wordSenses.wordId, wordId)).run();
        tx.delete(wordExamples).where(eq(wordExamples.wordId, wordId)).run();
        tx.delete(wordPhrases).where(eq(wordPhrases.wordId, wordId)).run();
        tx.delete(wordForms).where(eq(wordForms.wordId, wordId)).run();
        tx.delete(wordRelations).where(eq(wordRelations.wordId, wordId)).run();

        entry.word.senses.slice(0, MAX_SENSES_PER_WORD).forEach((sense, order) => {
          tx.insert(wordSenses)
            .values({
              id: randomUUID(),
              wordId,
              partOfSpeech: sense.partOfSpeech ?? null,
              definitionZh: sense.definitionZh.trim(),
              definitionEn: sense.definitionEn ?? null,
              examMeaning: sense.examMeaning ?? null,
              sortOrder: order,
            })
            .run();
        });

        (entry.word.examples ?? []).slice(0, MAX_EXAMPLES_PER_WORD).forEach((example, order) => {
          tx.insert(wordExamples)
            .values({
              id: randomUUID(),
              wordId,
              senseId: null,
              textEn: example.textEn.trim(),
              textZh: example.textZh.trim(),
              audioKey: null,
              sortOrder: order,
            })
            .run();
        });

        (entry.word.phrases ?? []).slice(0, MAX_PHRASES_PER_WORD).forEach((phrase, order) => {
          tx.insert(wordPhrases)
            .values({
              id: randomUUID(),
              wordId,
              kind: phrase.kind ?? 'phrase',
              text: phrase.text.trim(),
              translation: phrase.translation.trim(),
              sortOrder: order,
            })
            .run();
        });

        (entry.word.forms ?? []).slice(0, MAX_FORMS_PER_WORD).forEach((form) => {
          tx.insert(wordForms)
            .values({ id: randomUUID(), wordId, formType: form.formType, value: form.value })
            .run();
        });

        (entry.word.relations ?? []).slice(0, MAX_RELATIONS_PER_WORD).forEach((relation) => {
          tx.insert(wordRelations)
            .values({
              id: randomUUID(),
              wordId,
              relationType: relation.relationType,
              targetWordId: relation.targetWordId ?? null,
              targetText: relation.targetText ?? null,
            })
            .run();
        });

        // AI 补充内容单独一张表：只在来源提供时才写入，绝不触碰词典字段
        if (entry.word.aiNotes) {
          tx.delete(wordAiNotes).where(eq(wordAiNotes.wordId, wordId)).run();
          tx.insert(wordAiNotes)
            .values({
              id: randomUUID(),
              wordId,
              memoryTip: entry.word.aiNotes.memoryTip ?? null,
              usageNote: entry.word.aiNotes.usageNote ?? null,
              confusableNote: entry.word.aiNotes.confusableNote ?? null,
              extraExamplesJson: entry.word.aiNotes.extraExamples
                ? JSON.stringify(entry.word.aiNotes.extraExamples)
                : null,
              provider: entry.word.aiNotes.provider ?? null,
              model: entry.word.aiNotes.model ?? null,
              generatedAt: now,
            })
            .run();
        }

        // 词库条目：同一词库内幂等
        tx.delete(wordbookEntries)
          .where(
            and(eq(wordbookEntries.wordbookId, book.id), eq(wordbookEntries.wordId, wordId)),
          )
          .run();
        tx.insert(wordbookEntries)
          .values({
            wordbookId: book.id,
            wordId,
            rank: entry.word.rank ?? null,
            tagsJson: entry.word.tags && entry.word.tags.length > 0 ? JSON.stringify(entry.word.tags) : null,
          })
          .run();
      }

      const wordCount = countEntries(tx, book.id);
      const version = book.version + 1;
      tx.update(wordbooks)
        .set({ wordCount, version, updatedAt: now })
        .where(eq(wordbooks.id, book.id))
        .run();

      return {
        wordbookKey: input.key,
        created,
        updated,
        failed: failures,
        version,
        wordCount,
      };
    });
  }
}

function upsertWordbook(
  tx: DrizzleDb,
  input: ImportWordbookInput,
  now: number,
): { id: string; version: number } {
  const existing = tx.select().from(wordbooks).where(eq(wordbooks.key, input.key)).get();
  if (existing) {
    tx.update(wordbooks)
      .set({
        name: input.name,
        description: input.description ?? existing.description,
        language: input.language ?? existing.language,
        isSystem: input.isSystem === undefined ? existing.isSystem : input.isSystem ? 1 : 0,
        updatedAt: now,
      })
      .where(eq(wordbooks.id, existing.id))
      .run();
    return { id: existing.id, version: existing.version };
  }
  const id = randomUUID();
  tx.insert(wordbooks)
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
  return { id, version: 1 };
}

function countEntries(tx: DrizzleDb, wordbookId: string): number {
  const row = tx
    .select({ count: sql<number>`COUNT(*)` })
    .from(wordbookEntries)
    .where(eq(wordbookEntries.wordbookId, wordbookId))
    .get();
  return Number(row?.count ?? 0);
}

/** 归一化词形：NFKC + 去首尾空白 + 小写，保证同一单词的不同写法命中同一条记录 */
export function normalizeHeadword(headword: string): string {
  return headword.normalize('NFKC').trim().toLowerCase();
}

/**
 * 词条校验：词形与释义是底线；不合法只跳过该词条并给出原因，不中断整批导入。
 */
export function validateImportWord(word: ImportWordInput): string | null {
  if (!word || typeof word !== 'object') return '词条结构不合法';
  if (!word.headword || word.headword.trim().length === 0) return '缺少词形';
  if (word.headword.trim().length > 64) return '词形过长';
  const canonical = normalizeHeadword(word.headword);
  if (!/^[a-z0-9' .-]+$/.test(canonical)) return '词形包含不支持的字符';
  if (!Array.isArray(word.senses) || word.senses.length === 0) return '缺少释义';
  const badSense = word.senses.find(
    (sense) => !sense || typeof sense.definitionZh !== 'string' || sense.definitionZh.trim().length === 0,
  );
  if (badSense) return '存在空释义';
  if (word.senses.length > MAX_SENSES_PER_WORD) return `释义数量超过上限 ${MAX_SENSES_PER_WORD}`;
  const badExample = (word.examples ?? []).find(
    (example) => !example?.textEn?.trim() || !example?.textZh?.trim(),
  );
  if (badExample) return '存在空的例句';
  const badPhrase = (word.phrases ?? []).find(
    (phrase) => !phrase?.text?.trim() || !phrase?.translation?.trim(),
  );
  if (badPhrase) return '存在空的短语';
  const badForm = (word.forms ?? []).find((form) => !form?.formType?.trim() || !form?.value?.trim());
  if (badForm) return '存在空的词形变化';
  const badRelation = (word.relations ?? []).find(
    (relation) =>
      !relation ||
      !['synonym', 'antonym', 'confusable'].includes(relation.relationType) ||
      (!relation.targetWordId && !relation.targetText?.trim()),
  );
  if (badRelation) return '存在不合法的词条关系';
  return null;
}

/**
 * 合并同一词形的多行数据（数据源常见形态：一个单词拆成多行，每行一个词性/义项）。
 * 合并策略：集合类字段取并集并按内容去重；标量字段以先出现的非空值为准。
 */
export function mergeWords(base: ImportWordInput, extra: ImportWordInput): ImportWordInput {
  const dedupeBy = <T>(items: T[], key: (item: T) => string): T[] => {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const item of items) {
      const k = key(item);
      if (seen.has(k)) continue;
      seen.add(k);
      result.push(item);
    }
    return result;
  };

  return {
    headword: base.headword,
    phoneticUk: base.phoneticUk ?? extra.phoneticUk ?? null,
    phoneticUs: base.phoneticUs ?? extra.phoneticUs ?? null,
    audioUkKey: base.audioUkKey ?? extra.audioUkKey ?? null,
    audioUsKey: base.audioUsKey ?? extra.audioUsKey ?? null,
    rank:
      base.rank === null || base.rank === undefined
        ? (extra.rank ?? null)
        : extra.rank === null || extra.rank === undefined
          ? base.rank
          : Math.min(base.rank, extra.rank),
    tags: [...new Set([...(base.tags ?? []), ...(extra.tags ?? [])])],
    senses: dedupeBy(
      [...base.senses, ...extra.senses],
      (sense) => `${sense.partOfSpeech ?? ''}|${sense.definitionZh.trim()}`,
    ),
    examples: dedupeBy(
      [...(base.examples ?? []), ...(extra.examples ?? [])],
      (example) => `${example.textEn.trim()}|${example.textZh.trim()}`,
    ),
    phrases: dedupeBy(
      [...(base.phrases ?? []), ...(extra.phrases ?? [])],
      (phrase) => `${phrase.kind ?? 'phrase'}|${phrase.text.trim()}`,
    ),
    forms: dedupeBy(
      [...(base.forms ?? []), ...(extra.forms ?? [])],
      (form) => `${form.formType.trim()}|${form.value.trim()}`,
    ),
    relations: dedupeBy(
      [...(base.relations ?? []), ...(extra.relations ?? [])],
      (relation) => `${relation.relationType}|${relation.targetWordId ?? relation.targetText ?? ''}`,
    ),
    aiNotes: base.aiNotes ?? extra.aiNotes ?? null,
  };
}
