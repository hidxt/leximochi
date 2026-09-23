import type { QuestionType, ReviewRating, SpellingErrorType, WordStatus } from '@leximochi/types';

export const LEARNING_REPOSITORY = 'LEARNING_REPOSITORY';

export interface UserWordStateRecord {
  userId: string;
  wordId: string;
  status: WordStatus;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueAt: number | null;
  lastReviewedAt: number | null;
  firstLearnedAt: number | null;
  totalReviews: number;
  correctReviews: number;
}

export interface ReviewLogRecord {
  id: string;
  userId: string;
  wordId: string;
  eventId: string;
  questionType: QuestionType;
  answerRaw: string;
  isCorrect: boolean;
  rating: ReviewRating;
  durationMs: number;
  answeredAt: number;
  clientAnsweredAt: number | null;
  easeFactorAfter: number;
  intervalDaysAfter: number;
  repetitionsAfter: number;
  dueAtAfter: number;
  source: string;
}

export interface NextStateInput {
  status: WordStatus;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueAt: number;
}

export interface ApplyReviewInput {
  userId: string;
  wordId: string;
  /** 幂等键：同一 eventId 只允许推进一次学习状态 */
  eventId: string;
  questionType: QuestionType;
  answerRaw: string;
  isCorrect: boolean;
  rating: ReviewRating;
  durationMs: number;
  /** 服务端时间：业务判定只使用它 */
  answeredAt: number;
  clientAnsweredAt: number | null;
  /** 由 SM-2 计算好的下一次状态（客户端不可提交这些值） */
  nextState: NextStateInput;
  source: string;
  spellingError?: { expected: string; actual: string; errorTypes: SpellingErrorType[] };
}

export interface ApplyReviewResult {
  /** false 表示该 eventId 已处理过（幂等命中），状态未被再次推进 */
  applied: boolean;
  state: UserWordStateRecord;
}

/** 按词条聚合的错拼统计（拼写/听写训练反馈） */
export interface SpellingErrorGroupRecord {
  wordId: string;
  headword: string;
  lastActual: string;
  errorCounts: Record<SpellingErrorType, number>;
  totalCount: number;
  firstAt: number;
  lastAt: number;
}

export interface LearningRepository {
  findState(userId: string, wordId: string): Promise<UserWordStateRecord | null>;
  /** 原子写入一次复习：幂等判定 + 状态推进 + 流水 + 错拼记录在同一事务内 */
  applyReview(input: ApplyReviewInput): Promise<ApplyReviewResult>;
  findReviewLogByEventId(userId: string, eventId: string): Promise<ReviewLogRecord | null>;
  countDue(userId: string, now: number): Promise<number>;
  /** 已学过的词条（按首次学习时间升序），供拼写/听写训练选词 */
  listLearnedWordIds(userId: string, limit: number): Promise<string[]>;
  /** 近期错拼过的词条（用于复习加权优先出现） */
  listRecentlyMisspelledWordIds(userId: string, since: number, limit: number): Promise<string[]>;
  /** 今日新学词数（首次学习时间在今天之内） */
  countNewLearnedSince(userId: string, since: number): Promise<number>;
  /** 今日复习次数：只统计「今天之前就已学过」的词的复习，避免与新学重复计数 */
  countReviewsSince(userId: string, since: number): Promise<number>;
  /** 到期词条（按逾期时长倒序），供出题使用 */
  listDueWordIds(userId: string, now: number, limit: number): Promise<string[]>;
  /** 错拼清单：按词条聚合错拼次数与分类（仅当前用户自己的数据） */
  listSpellingErrorGroups(userId: string, limit: number): Promise<SpellingErrorGroupRecord[]>;
  /** 错拼过的词条总数（用于清单分页展示） */
  countSpellingErrorGroups(userId: string): Promise<number>;
}
