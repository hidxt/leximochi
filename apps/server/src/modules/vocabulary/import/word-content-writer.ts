import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { DrizzleDb } from '../../../database/database.service';
import {
  wordAiNotes,
  wordExamples,
  wordForms,
  wordPhrases,
  wordRelations,
  wordSenses,
  words,
} from '../../../database/schema';
import type { ImportWordInput } from './import.types';

export const MAX_SENSES_PER_WORD = 30;
export const MAX_EXAMPLES_PER_WORD = 30;
export const MAX_PHRASES_PER_WORD = 50;
export const MAX_FORMS_PER_WORD = 20;
export const MAX_RELATIONS_PER_WORD = 50;

/**
 * 词典内容的写入与读取：导入与后台单条编辑共用同一套实现，
 * 避免两处各写一遍嵌套表逻辑而产生行为差异。
 *
 * 约定：调用方负责事务与 `words` 主行；这里只处理释义/例句/短语/词形/关系/AI 补充。
 */
export function writeNestedWordContent(
  tx: DrizzleDb,
  wordId: string,
  word: ImportWordInput,
  now: number,
): void {
  tx.delete(wordSenses).where(eq(wordSenses.wordId, wordId)).run();
  tx.delete(wordExamples).where(eq(wordExamples.wordId, wordId)).run();
  tx.delete(wordPhrases).where(eq(wordPhrases.wordId, wordId)).run();
  tx.delete(wordForms).where(eq(wordForms.wordId, wordId)).run();
  tx.delete(wordRelations).where(eq(wordRelations.wordId, wordId)).run();

  word.senses.slice(0, MAX_SENSES_PER_WORD).forEach((sense, order) => {
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

  (word.examples ?? []).slice(0, MAX_EXAMPLES_PER_WORD).forEach((example, order) => {
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

  (word.phrases ?? []).slice(0, MAX_PHRASES_PER_WORD).forEach((phrase, order) => {
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

  (word.forms ?? []).slice(0, MAX_FORMS_PER_WORD).forEach((form) => {
    tx.insert(wordForms)
      .values({ id: randomUUID(), wordId, formType: form.formType, value: form.value })
      .run();
  });

  (word.relations ?? []).slice(0, MAX_RELATIONS_PER_WORD).forEach((relation) => {
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
  if (word.aiNotes) {
    tx.delete(wordAiNotes).where(eq(wordAiNotes.wordId, wordId)).run();
    tx.insert(wordAiNotes)
      .values({
        id: randomUUID(),
        wordId,
        memoryTip: word.aiNotes.memoryTip ?? null,
        usageNote: word.aiNotes.usageNote ?? null,
        confusableNote: word.aiNotes.confusableNote ?? null,
        extraExamplesJson: word.aiNotes.extraExamples
          ? JSON.stringify(word.aiNotes.extraExamples)
          : null,
        provider: word.aiNotes.provider ?? null,
        model: word.aiNotes.model ?? null,
        generatedAt: now,
      })
      .run();
  }
}

/** 读取库内已有的词条及其嵌套内容，转成导入中间格式，便于与新数据合并 */
export function readExistingWord(tx: DrizzleDb, wordId: string): ImportWordInput {
  const word = tx.select().from(words).where(eq(words.id, wordId)).get();
  const senses = tx
    .select()
    .from(wordSenses)
    .where(eq(wordSenses.wordId, wordId))
    .orderBy(asc(wordSenses.sortOrder))
    .all();
  const examples = tx
    .select()
    .from(wordExamples)
    .where(eq(wordExamples.wordId, wordId))
    .orderBy(asc(wordExamples.sortOrder))
    .all();
  const phrases = tx
    .select()
    .from(wordPhrases)
    .where(eq(wordPhrases.wordId, wordId))
    .orderBy(asc(wordPhrases.sortOrder))
    .all();
  const forms = tx.select().from(wordForms).where(eq(wordForms.wordId, wordId)).all();
  const relations = tx.select().from(wordRelations).where(eq(wordRelations.wordId, wordId)).all();
  const ai = tx.select().from(wordAiNotes).where(eq(wordAiNotes.wordId, wordId)).get();

  return {
    headword: word?.headword ?? '',
    phoneticUk: word?.phoneticUk ?? null,
    phoneticUs: word?.phoneticUs ?? null,
    audioUkKey: word?.audioUkKey ?? null,
    audioUsKey: word?.audioUsKey ?? null,
    rank: null,
    tags: [],
    senses: senses.map((sense) => ({
      partOfSpeech: sense.partOfSpeech,
      definitionZh: sense.definitionZh,
      definitionEn: sense.definitionEn,
      examMeaning: sense.examMeaning,
    })),
    examples: examples.map((example) => ({ textEn: example.textEn, textZh: example.textZh })),
    phrases: phrases.map((phrase) => ({
      kind: phrase.kind,
      text: phrase.text,
      translation: phrase.translation,
    })),
    forms: forms.map((form) => ({ formType: form.formType, value: form.value })),
    relations: relations.map((relation) => ({
      relationType: relation.relationType as 'synonym' | 'antonym' | 'confusable' | 'derived',
      targetWordId: relation.targetWordId,
      targetText: relation.targetText,
    })),
    aiNotes: ai
      ? {
          memoryTip: ai.memoryTip,
          usageNote: ai.usageNote,
          confusableNote: ai.confusableNote,
          provider: ai.provider,
          model: ai.model,
        }
      : null,
  };
}
