/**
 * SM-2 类间隔重复调度（纯函数，服务端与测试共用）。
 *
 * 设计要点：
 * - 服务端唯一权威：客户端只上报「答题事实」，评分与调度参数全部由服务端计算。
 * - 完整留痕：每次调度后的 easeFactor / intervalDays / repetitions 都会写入 review_logs，
 *   为未来升级 FSRS 保留数据，迁移时无需清空用户学习记录。
 */

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export type WordStatus = 'new' | 'learning' | 'review' | 'mastered';

export type SpellingErrorType =
  | 'missing_letter'
  | 'duplicate_letter'
  | 'order_error'
  | 'wrong_letter';

export interface Sm2State {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  status: WordStatus;
}

export interface Sm2Result extends Sm2State {
  /** 下次复习时间（UTC 毫秒） */
  dueAt: number;
}

export interface Sm2Options {
  /** again 之后到下次可练的间隔，默认 10 分钟 */
  againDelayMs?: number;
  /** 判定 mastered 所需的最少重复次数，默认 5 */
  masteredMinRepetitions?: number;
  /** 判定 mastered 所需的最短间隔天数，默认 21 */
  masteredMinIntervalDays?: number;
  /** review 状态所需的重复次数下限，默认 3 */
  reviewMinRepetitions?: number;
  /** review 状态所需的间隔天数下限，默认 6 */
  reviewMinIntervalDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const EASE_FLOOR = 1.3;
const EASE_CEILING = 3.0;
const EASE_PENALTY_AGAIN = 0.2;
const EASE_PENALTY_HARD = 0.15;
const EASE_BONUS_EASY = 0.15;
const HARD_INTERVAL_FACTOR = 1.2;
const EASY_INTERVAL_BONUS = 1.3;

/** 错拼类型的额外难度惩罚权重 */
const SPELLING_PENALTY: Record<SpellingErrorType, number> = {
  missing_letter: 0.05,
  duplicate_letter: 0.05,
  order_error: 0.1,
  wrong_letter: 0.03,
};

export const INITIAL_SM2_STATE: Sm2State = {
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0,
  lapses: 0,
  status: 'new',
};

function clampEase(value: number): number {
  return Math.min(EASE_CEILING, Math.max(EASE_FLOOR, Number(value.toFixed(4))));
}

function resolveStatus(
  state: { repetitions: number; intervalDays: number },
  options: Required<
    Pick<
      Sm2Options,
      'masteredMinRepetitions' | 'masteredMinIntervalDays' | 'reviewMinRepetitions' | 'reviewMinIntervalDays'
    >
  >,
): WordStatus {
  if (
    state.repetitions >= options.masteredMinRepetitions &&
    state.intervalDays >= options.masteredMinIntervalDays
  ) {
    return 'mastered';
  }
  if (
    state.repetitions >= options.reviewMinRepetitions &&
    state.intervalDays >= options.reviewMinIntervalDays
  ) {
    return 'review';
  }
  return 'learning';
}

export function mapAnswerToRating(input: {
  isCorrect: boolean;
  durationMs: number;
  fastMs?: number;
  slowMs?: number;
}): ReviewRating {
  if (!input.isCorrect) return 'again';
  const fastMs = input.fastMs ?? 3000;
  const slowMs = input.slowMs ?? 8000;
  if (input.durationMs <= fastMs) return 'easy';
  if (input.durationMs >= slowMs) return 'hard';
  return 'good';
}

export function applySm2(
  state: Sm2State,
  rating: ReviewRating,
  answeredAt: number,
  options: Sm2Options = {},
): Sm2Result {
  const againDelayMs = options.againDelayMs ?? 10 * MINUTE_MS;
  const thresholds = {
    masteredMinRepetitions: options.masteredMinRepetitions ?? 5,
    masteredMinIntervalDays: options.masteredMinIntervalDays ?? 21,
    reviewMinRepetitions: options.reviewMinRepetitions ?? 3,
    reviewMinIntervalDays: options.reviewMinIntervalDays ?? 6,
  };

  let easeFactor = state.easeFactor;
  let intervalDays = state.intervalDays;
  let repetitions = state.repetitions;
  let lapses = state.lapses;

  switch (rating) {
    case 'again': {
      repetitions = 0;
      intervalDays = 0;
      lapses += 1;
      easeFactor = clampEase(easeFactor - EASE_PENALTY_AGAIN);
      break;
    }
    case 'hard': {
      repetitions += 1;
      intervalDays = repetitions === 1 ? 1 : Math.max(1, Math.round(intervalDays * HARD_INTERVAL_FACTOR));
      easeFactor = clampEase(easeFactor - EASE_PENALTY_HARD);
      break;
    }
    case 'good': {
      repetitions += 1;
      intervalDays =
        repetitions === 1
          ? 1
          : repetitions === 2
            ? 6
            : Math.max(1, Math.round(intervalDays * easeFactor));
      break;
    }
    case 'easy': {
      repetitions += 1;
      intervalDays =
        repetitions === 1
          ? 3
          : repetitions === 2
            ? 8
            : Math.max(1, Math.round(intervalDays * easeFactor * EASY_INTERVAL_BONUS));
      easeFactor = clampEase(easeFactor + EASE_BONUS_EASY);
      break;
    }
  }

  const status = resolveStatus({ repetitions, intervalDays }, thresholds);
  const dueAt = rating === 'again' ? answeredAt + againDelayMs : answeredAt + intervalDays * DAY_MS;

  return { easeFactor, intervalDays, repetitions, lapses, status, dueAt };
}

/** 拼写/听写错拼的额外惩罚：同一次答题可包含多种错拼类型 */
export function applySpellingPenalty(state: Sm2State, errorTypes: SpellingErrorType[]): Sm2State {
  if (errorTypes.length === 0) return state;
  const total = errorTypes.reduce((sum, type) => sum + (SPELLING_PENALTY[type] ?? 0), 0);
  return { ...state, easeFactor: clampEase(state.easeFactor - total) };
}

/** 错拼后应在近期内更早再次出现（天数越小出现越早），仅用于查询排序加权 */
export function spellingPriorityBoostDays(errorTypes: SpellingErrorType[]): number {
  return errorTypes.length > 0 ? 7 : 0;
}
