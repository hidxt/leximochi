import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import type {
  WordAiNotesDto,
  WordExportEntry,
  WordExampleDto,
  WordFormDto,
  WordPhraseDto,
  WordRelationDto,
  WordSenseDto,
  WordStatus,
} from '@leximochi/types';
import { DATABASE } from '../database.constants';
import type { DatabaseService } from '../database.service';
import {
  wordAiNotes,
  wordExamples,
  wordForms,
  wordPhrases,
  wordRelations,
  wordSenses,
  wordbookEntries,
  words,
} from '../schema';
import { userWordStates } from '../schema';
import type {
  WordDetailRecord,
  WordRecord,
  WordRepository,
  WordSearchItem,
  WordStateRecord,
} from '../../modules/vocabulary/domain/word.repository';

@Injectable()
export class DrizzleWordRepository implements WordRepository {
  constructor(@Inject(DATABASE) private readonly database: DatabaseService) {}

  async findDetailById(id: string): Promise<WordDetailRecord | null> {
    const word = this.database.db.select().from(words).where(eq(words.id, id)).get();
    if (!word) return null;

    const nested = await this.nestedFor([id]);

    return {
      ...toWordRecord(word),
      senses: nested.senses.get(id) ?? [],
      examples: nested.examples.get(id) ?? [],
      phrases: nested.phrases.get(id) ?? [],
      forms: nested.forms.get(id) ?? [],
      relations: nested.relations.get(id) ?? [],
      aiNotes: nested.aiNotes.get(id) ?? null,
    };
  }

  async listByWordbook(
    wordbookId: string,
    page: { cursor?: string; limit: number },
  ): Promise<{ items: WordExportEntry[]; nextCursor: string | null }> {
    const limit = page.limit;
    const rows = this.database.db
      .select({
        word: words,
        rank: wordbookEntries.rank,
        tagsJson: wordbookEntries.tagsJson,
      })
      .from(wordbookEntries)
      .innerJoin(words, eq(words.id, wordbookEntries.wordId))
      .where(
        page.cursor
          ? and(eq(wordbookEntries.wordbookId, wordbookId), gt(words.id, page.cursor))
          : eq(wordbookEntries.wordbookId, wordbookId),
      )
      .orderBy(asc(words.id))
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1] as { word: typeof words.$inferSelect } | undefined;
    const wordIds = pageRows.map((row) => row.word.id);
    const nested = await this.nestedFor(wordIds);

    return {
      items: pageRows.map((row) => ({
        ...toWordRecord(row.word),
        rank: row.rank,
        tags: parseTags(row.tagsJson),
        senses: nested.senses.get(row.word.id) ?? [],
        examples: nested.examples.get(row.word.id) ?? [],
        phrases: nested.phrases.get(row.word.id) ?? [],
        forms: nested.forms.get(row.word.id) ?? [],
        relations: nested.relations.get(row.word.id) ?? [],
      })),
      nextCursor: hasMore && last ? last.word.id : null,
    };
  }

  async search(
    query: string,
    options: { wordbookId?: string; limit: number },
  ): Promise<WordSearchItem[]> {
    const pattern = `%${escapeLike(query.toLowerCase())}%`;
    const matched = this.database.db
      .select({ id: words.id, headword: words.headword, phoneticUk: words.phoneticUk, phoneticUs: words.phoneticUs })
      .from(words)
      .where(sql`lower(${words.headword}) LIKE ${pattern} ESCAPE '\\'`)
      .limit(options.limit)
      .all();

    let ids = matched.map((row) => row.id);
    if (options.wordbookId) {
      if (ids.length === 0) return [];
      const inBook = this.database.db
        .select({ wordId: wordbookEntries.wordId })
        .from(wordbookEntries)
        .where(
          and(
            eq(wordbookEntries.wordbookId, options.wordbookId),
            inArray(wordbookEntries.wordId, ids),
          ),
        )
        .all();
      const allowed = new Set(inBook.map((row) => row.wordId));
      ids = ids.filter((id) => allowed.has(id));
    }
    if (ids.length === 0) return [];

    const senses = (await this.nestedFor(ids)).senses;
    return matched
      .filter((row) => ids.includes(row.id))
      .map((row) => {
        const first = senses.get(row.id)?.[0];
        return {
          id: row.id,
          headword: row.headword,
          phoneticUk: row.phoneticUk,
          phoneticUs: row.phoneticUs,
          definitionZh: first?.definitionZh ?? null,
          examMeaning: first?.examMeaning ?? null,
        };
      });
  }

  async findUserState(userId: string, wordId: string): Promise<WordStateRecord | null> {
    const row = this.database.db
      .select()
      .from(userWordStates)
      .where(and(eq(userWordStates.userId, userId), eq(userWordStates.wordId, wordId)))
      .get();
    if (!row) return null;
    return {
      status: row.status as WordStatus,
      easeFactor: row.easeFactor,
      intervalDays: row.intervalDays,
      repetitions: row.repetitions,
      lapses: row.lapses,
      dueAt: row.dueAt,
      lastReviewedAt: row.lastReviewedAt,
      totalReviews: row.totalReviews,
      correctReviews: row.correctReviews,
    };
  }

  /** 一次取回一批词条的全部嵌套数据，避免逐词查询造成 N+1 */
  private async nestedFor(wordIds: string[]): Promise<{
    senses: Map<string, WordSenseDto[]>;
    examples: Map<string, WordExampleDto[]>;
    phrases: Map<string, WordPhraseDto[]>;
    forms: Map<string, WordFormDto[]>;
    relations: Map<string, WordRelationDto[]>;
    aiNotes: Map<string, WordAiNotesDto>;
  }> {
    const [senses, examples, phrases, forms, relations, aiNotes] = await Promise.all([
      this.sensesFor(wordIds),
      this.examplesFor(wordIds),
      this.phrasesFor(wordIds),
      this.formsFor(wordIds),
      this.relationsFor(wordIds),
      this.aiNotesFor(wordIds),
    ]);
    return { senses, examples, phrases, forms, relations, aiNotes };
  }

  /** 以下批量查询均按一批 wordId 取回，避免逐词查询造成 N+1 */
  private async sensesFor(wordIds: string[]): Promise<Map<string, WordSenseDto[]>> {
    const map = new Map<string, WordSenseDto[]>();
    if (wordIds.length === 0) return map;
    const rows = this.database.db
      .select()
      .from(wordSenses)
      .where(inArray(wordSenses.wordId, wordIds))
      .orderBy(asc(wordSenses.sortOrder))
      .all();
    for (const row of rows) {
      const list = map.get(row.wordId) ?? [];
      list.push({
        id: row.id,
        partOfSpeech: row.partOfSpeech,
        definitionZh: row.definitionZh,
        definitionEn: row.definitionEn,
        examMeaning: row.examMeaning,
      });
      map.set(row.wordId, list);
    }
    return map;
  }

  private async examplesFor(wordIds: string[]): Promise<Map<string, WordExampleDto[]>> {
    const map = new Map<string, WordExampleDto[]>();
    if (wordIds.length === 0) return map;
    const rows = this.database.db
      .select()
      .from(wordExamples)
      .where(inArray(wordExamples.wordId, wordIds))
      .orderBy(asc(wordExamples.sortOrder))
      .all();
    for (const row of rows) {
      const list = map.get(row.wordId) ?? [];
      list.push({ id: row.id, textEn: row.textEn, textZh: row.textZh, audioKey: row.audioKey });
      map.set(row.wordId, list);
    }
    return map;
  }

  private async phrasesFor(wordIds: string[]): Promise<Map<string, WordPhraseDto[]>> {
    const map = new Map<string, WordPhraseDto[]>();
    if (wordIds.length === 0) return map;
    const rows = this.database.db
      .select()
      .from(wordPhrases)
      .where(inArray(wordPhrases.wordId, wordIds))
      .orderBy(asc(wordPhrases.sortOrder))
      .all();
    for (const row of rows) {
      const list = map.get(row.wordId) ?? [];
      list.push({
        id: row.id,
        kind: row.kind,
        text: row.text,
        translation: row.translation,
      });
      map.set(row.wordId, list);
    }
    return map;
  }

  private async formsFor(wordIds: string[]): Promise<Map<string, WordFormDto[]>> {
    const map = new Map<string, WordFormDto[]>();
    if (wordIds.length === 0) return map;
    const rows = this.database.db
      .select()
      .from(wordForms)
      .where(inArray(wordForms.wordId, wordIds))
      .all();
    for (const row of rows) {
      const list = map.get(row.wordId) ?? [];
      list.push({ id: row.id, formType: row.formType, value: row.value });
      map.set(row.wordId, list);
    }
    return map;
  }

  private async relationsFor(wordIds: string[]): Promise<Map<string, WordRelationDto[]>> {
    const map = new Map<string, WordRelationDto[]>();
    if (wordIds.length === 0) return map;
    const rows = this.database.db
      .select()
      .from(wordRelations)
      .where(inArray(wordRelations.wordId, wordIds))
      .all();
    for (const row of rows) {
      const list = map.get(row.wordId) ?? [];
      list.push({
        id: row.id,
        relationType: row.relationType,
        targetWordId: row.targetWordId,
        targetText: row.targetText,
      });
      map.set(row.wordId, list);
    }
    return map;
  }

  private async aiNotesFor(wordIds: string[]): Promise<Map<string, WordAiNotesDto>> {
    const map = new Map<string, WordAiNotesDto>();
    if (wordIds.length === 0) return map;
    const rows = this.database.db
      .select()
      .from(wordAiNotes)
      .where(inArray(wordAiNotes.wordId, wordIds))
      .all();
    for (const row of rows) {
      map.set(row.wordId, {
        memoryTip: row.memoryTip,
        usageNote: row.usageNote,
        confusableNote: row.confusableNote,
        extraExamples: parseExtraExamples(row.extraExamplesJson),
        provider: row.provider,
        model: row.model,
        generatedAt: row.generatedAt,
      });
    }
    return map;
  }
}

function toWordRecord(row: typeof words.$inferSelect): WordRecord {
  return {
    id: row.id,
    headword: row.headword,
    headwordCanonical: row.headwordCanonical,
    phoneticUk: row.phoneticUk,
    phoneticUs: row.phoneticUs,
    audioUkKey: row.audioUkKey,
    audioUsKey: row.audioUsKey,
    source: row.source,
  };
}

function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseExtraExamples(json: string | null): Array<{ textEn: string; textZh: string }> {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is { textEn: string; textZh: string } =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as { textEn?: unknown }).textEn === 'string' &&
          typeof (item as { textZh?: unknown }).textZh === 'string',
      )
      .map((item) => ({ textEn: item.textEn, textZh: item.textZh }));
  } catch {
    return [];
  }
}

/** 转义 LIKE 通配符，避免用户输入 `%` 造成全表匹配 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
