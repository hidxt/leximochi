import type {
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
}
