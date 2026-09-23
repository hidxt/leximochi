import { Inject, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  QuestionType,
  type ReviewHistoryPage,
  type ReviewStats,
  type SpellingErrorSummary,
  type SpellingErrorSummaryItem,
  type SubmitReviewResponse,
  type WordStateDto,
} from '@leximochi/types';
import {
  INITIAL_SM2_STATE,
  applySm2,
  applySpellingPenalty,
  mapAnswerToRating,
  type Sm2State,
} from '@leximochi/core';
import { AppError } from '../../common/errors/app-error';
import {
  WORD_REPOSITORY,
  type WordRepository,
} from '../vocabulary/domain/word.repository';
import { checkAnswer, classifySpellingError } from './answer-checker';
import { formatHistoryCursor, parseHistoryCursor } from './history-cursor';
import {
  LEARNING_REPOSITORY,
  type LearningRepository,
  type UserWordStateRecord,
} from './domain/learning.repository';

/** 拼写/听写类题型在答错时记录错拼分类 */
const SPELLING_TYPES: ReadonlySet<QuestionType> = new Set([
  QuestionType.Spelling,
  QuestionType.ListeningDictation,
]);

const DEFAULT_HISTORY_LIMIT = 30;

export interface ListHistoryQuery {
  cursor?: string;
  limit?: number;
}

export interface SubmitReviewCommand {
  eventId: string;
  wordId: string;
  questionType: QuestionType;
  answer: string;
  durationMs: number;
  clientAnsweredAt?: number;
}

export interface SubmitReviewContext {
  userId: string;
  source: string;
}

@Injectable()
export class LearningService {
  constructor(
    @Inject(LEARNING_REPOSITORY) private readonly learning: LearningRepository,
    @Inject(WORD_REPOSITORY) private readonly words: WordRepository,
  ) {}

  /**
   * 提交一次答题。
   *
   * 服务端权威：客户端只提交「答题事实」（题目类型、原始答案、用时、幂等键），
   * 对错判定、评分映射、SM-2 调度参数全部由服务端计算并落库。
   */
  async submit(
    command: SubmitReviewCommand,
    context: SubmitReviewContext,
  ): Promise<SubmitReviewResponse> {
    const word = await this.words.findDetailById(command.wordId);
    if (!word) {
      throw new AppError(ErrorCode.WORD_NOT_FOUND, '词条不存在', 404);
    }

    const definitions = word.senses.map((sense) => sense.definitionZh);
    const checked = checkAnswer({
      questionType: command.questionType,
      headword: word.headword,
      definitions,
      answer: command.answer,
    });
    const rating = mapAnswerToRating({ isCorrect: checked.correct, durationMs: command.durationMs });
    const answeredAt = Date.now();

    // 错拼分类只在拼写/听写题答错时产生，并且必须先于调度计算：
    // 除「答错」本身的难度惩罚外，漏字母/顺序错误等再额外降低难度，
    // 这些词后续会出现得更早（见 StudyService 的错拼加权选词）。
    const spellingErrorTypes =
      !checked.correct && SPELLING_TYPES.has(command.questionType)
        ? classifySpellingError(word.headword, command.answer)
        : [];

    const current = await this.learning.findState(context.userId, command.wordId);
    const sm2State: Sm2State = current
      ? {
          easeFactor: current.easeFactor,
          intervalDays: current.intervalDays,
          repetitions: current.repetitions,
          lapses: current.lapses,
          status: current.status,
        }
      : INITIAL_SM2_STATE;
    const next = applySm2(applySpellingPenalty(sm2State, spellingErrorTypes), rating, answeredAt);

    const result = await this.learning.applyReview({
      userId: context.userId,
      wordId: command.wordId,
      eventId: command.eventId,
      questionType: command.questionType,
      answerRaw: command.answer,
      isCorrect: checked.correct,
      rating,
      durationMs: command.durationMs,
      answeredAt,
      clientAnsweredAt: command.clientAnsweredAt ?? null,
      nextState: {
        status: next.status,
        easeFactor: next.easeFactor,
        intervalDays: next.intervalDays,
        repetitions: next.repetitions,
        lapses: next.lapses,
        dueAt: next.dueAt,
      },
      source: context.source,
      spellingError:
        spellingErrorTypes.length > 0
          ? { expected: word.headword, actual: command.answer, errorTypes: spellingErrorTypes }
          : undefined,
    });

    // 幂等命中时以已存在的流水为准返回，保证客户端重试得到一致结果
    if (!result.applied) {
      const existingLog = await this.learning.findReviewLogByEventId(context.userId, command.eventId);
      return {
        correct: existingLog?.isCorrect ?? checked.correct,
        correctAnswer: checked.correctAnswer,
        rating: existingLog?.rating ?? rating,
        state: toStateDto(result.state),
        spellingErrors: [],
      };
    }

    return {
      correct: checked.correct,
      correctAnswer: checked.correctAnswer,
      rating,
      state: toStateDto(result.state),
      spellingErrors: spellingErrorTypes,
    };
  }

  /** 错拼清单：只返回当前用户自己的错拼记录聚合（按最近错拼时间倒序） */
  async listSpellingErrors(userId: string, limit: number): Promise<SpellingErrorSummary> {
    const [groups, total] = await Promise.all([
      this.learning.listSpellingErrorGroups(userId, limit),
      this.learning.countSpellingErrorGroups(userId),
    ]);
    const items: SpellingErrorSummaryItem[] = groups.map((group) => ({
      wordId: group.wordId,
      headword: group.headword,
      lastActual: group.lastActual,
      errorCounts: group.errorCounts,
      totalCount: group.totalCount,
      firstAt: group.firstAt,
      lastAt: group.lastAt,
    }));
    return { items, total };
  }

  /** 复习历史分页（按答题时间倒序），仅当前用户自己的记录 */
  async listHistory(userId: string, query: ListHistoryQuery): Promise<ReviewHistoryPage> {
    const cursor = query.cursor ? parseHistoryCursor(query.cursor) : undefined;
    const page = await this.learning.listReviewHistory(userId, {
      cursor,
      limit: query.limit ?? DEFAULT_HISTORY_LIMIT,
    });
    return {
      items: page.items,
      nextCursor: page.nextCursor ? formatHistoryCursor(page.nextCursor) : null,
    };
  }

  /**
   * 学习统计。所有数值都由服务端聚合得出：
   * 正确率与平均用时按「今日全部作答」计算（含新学首答），趋势按 UTC 日期分 7 天。
   */
  async getStats(userId: string): Promise<ReviewStats> {
    const record = await this.learning.getReviewStats(userId, Date.now());
    return {
      learnedToday: record.learnedToday,
      reviewedToday: record.reviewedToday,
      correctToday: record.correctToday,
      accuracyToday:
        record.answeredToday > 0
          ? Number((record.correctToday / record.answeredToday).toFixed(4))
          : null,
      averageDurationMsToday: record.averageDurationMsToday,
      masteredWords: record.masteredWords,
      learningWords: record.learningWords,
      notebookCount: record.notebookCount,
      dailyTrend: record.dailyTrend,
    };
  }
}

export function toStateDto(state: UserWordStateRecord): WordStateDto {
  return {
    status: state.status,
    easeFactor: state.easeFactor,
    intervalDays: state.intervalDays,
    repetitions: state.repetitions,
    lapses: state.lapses,
    dueAt: state.dueAt,
    lastReviewedAt: state.lastReviewedAt,
    totalReviews: state.totalReviews,
    correctReviews: state.correctReviews,
  };
}
