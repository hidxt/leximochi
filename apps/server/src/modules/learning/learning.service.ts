import { Inject, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  QuestionType,
  type SubmitReviewResponse,
  type WordStateDto,
} from '@leximochi/types';
import { INITIAL_SM2_STATE, applySm2, mapAnswerToRating, type Sm2State } from '@leximochi/core';
import { AppError } from '../../common/errors/app-error';
import {
  WORD_REPOSITORY,
  type WordRepository,
} from '../vocabulary/domain/word.repository';
import { checkAnswer, classifySpellingError } from './answer-checker';
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
    const next = applySm2(sm2State, rating, answeredAt);

    const spellingErrorTypes =
      !checked.correct && SPELLING_TYPES.has(command.questionType)
        ? classifySpellingError(word.headword, command.answer)
        : [];

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
