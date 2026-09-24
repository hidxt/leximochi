import type {
  AdminWordListItem,
  WordAiNotesDto,
  WordExampleDto,
  WordExportEntry,
  WordFormDto,
  WordPhraseDto,
  WordRelationDto,
  WordSenseDto,
  WordStatus,
} from '@leximochi/types';

export const WORD_REPOSITORY = 'WORD_REPOSITORY';

export interface WordRecord {
  id: string;
  headword: string;
  headwordCanonical: string;
  phoneticUk: string | null;
  phoneticUs: string | null;
  audioUkKey: string | null;
  audioUsKey: string | null;
  source: 'dictionary' | 'imported';
}

export interface WordDetailRecord extends WordRecord {
  senses: WordSenseDto[];
  examples: WordExampleDto[];
  phrases: WordPhraseDto[];
  forms: WordFormDto[];
  relations: WordRelationDto[];
  aiNotes: WordAiNotesDto | null;
}

export interface WordSearchItem {
  id: string;
  headword: string;
  phoneticUk: string | null;
  phoneticUs: string | null;
  definitionZh: string | null;
  examMeaning: string | null;
}

/** 学习状态读模型（写入与调度在 learning 模块，读模型供词条详情使用） */
export interface WordStateRecord {
  status: WordStatus;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueAt: number | null;
  lastReviewedAt: number | null;
  totalReviews: number;
  correctReviews: number;
}

export interface WordRepository {
  findDetailById(id: string): Promise<WordDetailRecord | null>;
  /**
   * 按词库分页导出完整词条数据（供 Android 离线下载）。
   * 以 wordId 升序作为稳定游标；教学顺序由 `rank` 承载，客户端自行排序。
   */
  listByWordbook(
    wordbookId: string,
    page: { cursor?: string; limit: number },
  ): Promise<{ items: WordExportEntry[]; nextCursor: string | null }>;
  search(
    query: string,
    options: { wordbookId?: string; limit: number },
  ): Promise<WordSearchItem[]>;
  findUserState(userId: string, wordId: string): Promise<WordStateRecord | null>;
  /** 该词库中用户尚未学过的词条（按词库内 rank 升序），用于新词学习 */
  listNewWordIdsForWordbook(userId: string, wordbookId: string, limit: number): Promise<string[]>;
  /** 该词库中尚未学过的词条数量（用于展示「还剩多少新词」） */
  countNewWordsForWordbook(userId: string, wordbookId: string): Promise<number>;
  /** 抽取干扰项释义（来自其他词条，按来源可限定词库），用于选择题选项 */
  listDistractorDefinitions(
    options: { wordbookId?: string; excludeWordId: string; limit: number },
  ): Promise<string[]>;
  /**
   * 后台检索词条（按词形或释义模糊匹配，可按词库过滤）。
   * 游标为 wordId 升序，与离线导出使用同一稳定顺序。
   */
  listForAdmin(options: {
    query?: string;
    wordbookId?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: AdminWordListItem[]; nextCursor: string | null }>;
}
