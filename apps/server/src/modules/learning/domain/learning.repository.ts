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

export interface LearningRepository {
  findState(userId: string, wordId: string): Promise<UserWordStateRecord | null>;
  /** 原子写入一次复习：幂等判定 + 状态推进 + 流水 + 错拼记录在同一事务内 */
  applyReview(input: ApplyReviewInput): Promise<ApplyReviewResult>;
  findReviewLogByEventId(userId: string, eventId: string): Promise<ReviewLogRecord | null>;
  countDue(userId: string, now: number): Promise<number>;
  countReviewsSince(userId: string, since: number): Promise<number>;
  /** 到期词条（按逾期时长倒序），供出题使用 */
  listDueWordIds(userId: string, now: number, limit: number): Promise<string[]>;
}
