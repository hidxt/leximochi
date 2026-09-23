import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { isSpellingErrorType, type QuestionType, type ReviewRating, type SpellingErrorType, type WordStatus } from '@leximochi/types';
import { DATABASE } from '../../database/database.constants';
import type { DatabaseService } from '../../database/database.service';
import { reviewLogs, spellingErrors, userWordStates } from '../../database/schema';
import type {
  ApplyReviewInput,
  ApplyReviewResult,
  DailyTrendPoint,
  LearningRepository,
  ReviewHistoryCursor,
  ReviewHistoryRecord,
  ReviewLogRecord,
  ReviewStatsRecord,
  SpellingErrorGroupRecord,
  UserWordStateRecord,
} from '../../modules/learning/domain/learning.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
/** 学习统计趋势窗口：含今日共 7 天 */
const TREND_DAYS = 7;

function startOfUtcDay(timestamp: number): number {
  return Math.floor(timestamp / DAY_MS) * DAY_MS;
}

@Injectable()
export class DrizzleLearningRepository implements LearningRepository {
  constructor(@Inject(DATABASE) private readonly database: DatabaseService) {}

  async findState(userId: string, wordId: string): Promise<UserWordStateRecord | null> {
    const row = this.database.db
      .select()
      .from(userWordStates)
      .where(and(eq(userWordStates.userId, userId), eq(userWordStates.wordId, wordId)))
      .get();
    return row ? toStateRecord(row) : null;
  }

  async applyReview(input: ApplyReviewInput): Promise<ApplyReviewResult> {
    return this.database.withTransaction((tx) => {
      const existingLog = tx
        .select({ id: reviewLogs.id })
        .from(reviewLogs)
        .where(eq(reviewLogs.eventId, input.eventId))
        .get();
      if (existingLog) {
        // 幂等命中：不重复推进状态，也不重复计分
        const state = tx
          .select()
          .from(userWordStates)
          .where(and(eq(userWordStates.userId, input.userId), eq(userWordStates.wordId, input.wordId)))
          .get();
        return {
          applied: false,
          state: state
            ? toStateRecord(state)
            : emptyState(input.userId, input.wordId),
        };
      }

      const logId = randomUUID();
      tx.insert(reviewLogs)
        .values({
          id: logId,
          userId: input.userId,
          wordId: input.wordId,
          eventId: input.eventId,
          questionType: input.questionType,
          answerRaw: input.answerRaw.slice(0, 200),
          isCorrect: input.isCorrect ? 1 : 0,
          rating: input.rating,
          durationMs: input.durationMs,
          answeredAt: input.answeredAt,
          clientAnsweredAt: input.clientAnsweredAt,
          easeFactorAfter: input.nextState.easeFactor,
          intervalDaysAfter: input.nextState.intervalDays,
          repetitionsAfter: input.nextState.repetitions,
          dueAtAfter: input.nextState.dueAt,
          source: input.source,
          createdAt: input.answeredAt,
        })
        .run();

      const existingState = tx
        .select()
        .from(userWordStates)
        .where(and(eq(userWordStates.userId, input.userId), eq(userWordStates.wordId, input.wordId)))
        .get();

      const next = input.nextState;
      if (existingState) {
        tx.update(userWordStates)
          .set({
            status: next.status,
            easeFactor: next.easeFactor,
            intervalDays: next.intervalDays,
            repetitions: next.repetitions,
            lapses: next.lapses,
            dueAt: next.dueAt,
            lastReviewedAt: input.answeredAt,
            totalReviews: existingState.totalReviews + 1,
            correctReviews: existingState.correctReviews + (input.isCorrect ? 1 : 0),
            updatedAt: input.answeredAt,
          })
          .where(and(eq(userWordStates.userId, input.userId), eq(userWordStates.wordId, input.wordId)))
          .run();
      } else {
        tx.insert(userWordStates)
          .values({
            userId: input.userId,
            wordId: input.wordId,
            status: next.status,
            easeFactor: next.easeFactor,
            intervalDays: next.intervalDays,
            repetitions: next.repetitions,
            lapses: next.lapses,
            dueAt: next.dueAt,
            lastReviewedAt: input.answeredAt,
            firstLearnedAt: input.answeredAt,
            totalReviews: 1,
            correctReviews: input.isCorrect ? 1 : 0,
            createdAt: input.answeredAt,
            updatedAt: input.answeredAt,
          })
          .run();
      }

      if (input.spellingError) {
        tx.insert(spellingErrors)
          .values({
            id: randomUUID(),
            userId: input.userId,
            wordId: input.wordId,
            reviewLogId: logId,
            expected: input.spellingError.expected.slice(0, 64),
            actual: input.spellingError.actual.slice(0, 64),
            errorTypes: input.spellingError.errorTypes.join(','),
            createdAt: input.answeredAt,
          })
          .run();
      }

      const saved = tx
        .select()
        .from(userWordStates)
        .where(and(eq(userWordStates.userId, input.userId), eq(userWordStates.wordId, input.wordId)))
        .get();
      if (!saved) throw new Error('学习状态写入失败');
      return { applied: true, state: toStateRecord(saved) };
    });
  }

  async findReviewLogByEventId(userId: string, eventId: string): Promise<ReviewLogRecord | null> {
    const row = this.database.db
      .select()
      .from(reviewLogs)
      .where(and(eq(reviewLogs.eventId, eventId), eq(reviewLogs.userId, userId)))
      .get();
    return row ? toLogRecord(row) : null;
  }

  async countDue(userId: string, now: number): Promise<number> {
    const row = this.database.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(userWordStates)
      .where(
        and(
          eq(userWordStates.userId, userId),
          isNotNull(userWordStates.dueAt),
          lte(userWordStates.dueAt, now),
        ),
      )
      .get();
    return Number(row?.count ?? 0);
  }

  async listLearnedWordIds(userId: string, limit: number): Promise<string[]> {
    return this.database.db
      .select({ wordId: userWordStates.wordId })
      .from(userWordStates)
      .where(eq(userWordStates.userId, userId))
      .orderBy(asc(userWordStates.firstLearnedAt))
      .limit(limit)
      .all()
      .map((row) => row.wordId);
  }

  async listRecentlyMisspelledWordIds(userId: string, since: number, limit: number): Promise<string[]> {
    const rows = this.database.sqlite
      .prepare(
        `SELECT word_id, MAX(created_at) AS last_at
         FROM spelling_errors
         WHERE user_id = ? AND created_at >= ?
         GROUP BY word_id
         ORDER BY last_at DESC
         LIMIT ?`,
      )
      .all(userId, since, limit) as Array<{ word_id: string }>;
    return rows.map((row) => row.word_id);
  }

  async countNewLearnedSince(userId: string, since: number): Promise<number> {
    const row = this.database.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(userWordStates)
      .where(and(eq(userWordStates.userId, userId), sql`${userWordStates.firstLearnedAt} >= ${since}`))
      .get();
    return Number(row?.count ?? 0);
  }

  async countReviewsSince(userId: string, since: number): Promise<number> {
    // 只统计「今天之前就已学过」的词的复习次数，避免与新学计数重复
    const row = this.database.sqlite
      .prepare(
        `SELECT COUNT(*) AS count
         FROM review_logs rl
         JOIN user_word_states s ON s.user_id = rl.user_id AND s.word_id = rl.word_id
         WHERE rl.user_id = ? AND rl.answered_at >= ? AND s.first_learned_at < ?`,
      )
      .get(userId, since, since) as { count: number };
    return Number(row?.count ?? 0);
  }

  async listDueWordIds(userId: string, now: number, limit: number): Promise<string[]> {
    return this.database.db
      .select({ wordId: userWordStates.wordId })
      .from(userWordStates)
      .where(
        and(
          eq(userWordStates.userId, userId),
          isNotNull(userWordStates.dueAt),
          lte(userWordStates.dueAt, now),
        ),
      )
      .orderBy(asc(userWordStates.dueAt))
      .limit(limit)
      .all()
      .map((row) => row.wordId);
  }

  async listSpellingErrorGroups(userId: string, limit: number): Promise<SpellingErrorGroupRecord[]> {
    // 全部使用绑定参数；word_id 列表由服务端生成，不接受客户端输入
    const groups = this.database.sqlite
      .prepare(
        `SELECT se.word_id AS wordId,
                w.headword AS headword,
                COUNT(*) AS totalCount,
                MIN(se.created_at) AS firstAt,
                MAX(se.created_at) AS lastAt,
                (SELECT s2.actual FROM spelling_errors s2
                  WHERE s2.user_id = se.user_id AND s2.word_id = se.word_id
                  ORDER BY s2.rowid DESC LIMIT 1) AS lastActual
         FROM spelling_errors se
         JOIN words w ON w.id = se.word_id
         WHERE se.user_id = ?
         GROUP BY se.word_id
         ORDER BY lastAt DESC, se.word_id ASC
         LIMIT ?`,
      )
      .all(userId, limit) as Array<{
      wordId: string;
      headword: string;
      totalCount: number;
      firstAt: number;
      lastAt: number;
      lastActual: string | null;
    }>;

    if (groups.length === 0) return [];

    const placeholders = groups.map(() => '?').join(',');
    const typeRows = this.database.sqlite
      .prepare(
        `SELECT word_id AS wordId, error_types AS errorTypes, COUNT(*) AS count
         FROM spelling_errors
         WHERE user_id = ? AND word_id IN (${placeholders})
         GROUP BY word_id, error_types`,
      )
      .all(userId, ...groups.map((group) => group.wordId)) as Array<{
      wordId: string;
      errorTypes: string;
      count: number;
    }>;

    const countsByWord = new Map<string, Record<SpellingErrorType, number>>();
    for (const row of typeRows) {
      const counts = countsByWord.get(row.wordId) ?? emptyErrorCounts();
      for (const raw of row.errorTypes.split(',')) {
        const type = raw.trim();
        // 库中历史数据可能含未知分类：忽略而不是崩溃
        if (isSpellingErrorType(type)) counts[type] += row.count;
      }
      countsByWord.set(row.wordId, counts);
    }

    return groups.map((group) => ({
      wordId: group.wordId,
      headword: group.headword,
      lastActual: group.lastActual ?? '',
      errorCounts: countsByWord.get(group.wordId) ?? emptyErrorCounts(),
      totalCount: Number(group.totalCount),
      firstAt: Number(group.firstAt),
      lastAt: Number(group.lastAt),
    }));
  }

  async countSpellingErrorGroups(userId: string): Promise<number> {
    const row = this.database.sqlite
      .prepare('SELECT COUNT(DISTINCT word_id) AS count FROM spelling_errors WHERE user_id = ?')
      .get(userId) as { count: number } | undefined;
    return Number(row?.count ?? 0);
  }

  async listReviewHistory(
    userId: string,
    page: { cursor?: ReviewHistoryCursor; limit: number },
  ): Promise<{ items: ReviewHistoryRecord[]; nextCursor: ReviewHistoryCursor | null }> {
    const limit = page.limit;
    const cursor = page.cursor;
    const rows = (
      cursor
        ? this.database.sqlite
            .prepare(
              `SELECT rl.id, rl.word_id AS wordId, w.headword AS headword,
                      rl.question_type AS questionType, rl.is_correct AS isCorrect,
                      rl.rating AS rating, rl.duration_ms AS durationMs, rl.answered_at AS answeredAt
               FROM review_logs rl
               JOIN words w ON w.id = rl.word_id
               WHERE rl.user_id = ?
                 AND (rl.answered_at < ? OR (rl.answered_at = ? AND rl.id < ?))
               ORDER BY rl.answered_at DESC, rl.id DESC
               LIMIT ?`,
            )
            .all(userId, cursor.answeredAt, cursor.answeredAt, cursor.id, limit + 1)
        : this.database.sqlite
            .prepare(
              `SELECT rl.id, rl.word_id AS wordId, w.headword AS headword,
                      rl.question_type AS questionType, rl.is_correct AS isCorrect,
                      rl.rating AS rating, rl.duration_ms AS durationMs, rl.answered_at AS answeredAt
               FROM review_logs rl
               JOIN words w ON w.id = rl.word_id
               WHERE rl.user_id = ?
               ORDER BY rl.answered_at DESC, rl.id DESC
               LIMIT ?`,
            )
            .all(userId, limit + 1)
    ) as Array<{
      id: string;
      wordId: string;
      headword: string;
      questionType: string;
      isCorrect: number;
      rating: string;
      durationMs: number;
      answeredAt: number;
    }>;

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((row) => ({
        id: row.id,
        wordId: row.wordId,
        headword: row.headword,
        questionType: row.questionType as QuestionType,
        isCorrect: row.isCorrect === 1,
        rating: row.rating as ReviewRating,
        durationMs: Number(row.durationMs),
        answeredAt: Number(row.answeredAt),
      })),
      nextCursor: hasMore && last ? { answeredAt: Number(last.answeredAt), id: last.id } : null,
    };
  }

  async getReviewStats(userId: string, now: number): Promise<ReviewStatsRecord> {
    const dayStart = startOfUtcDay(now);
    const trendStart = dayStart - (TREND_DAYS - 1) * DAY_MS;
    const sqlite = this.database.sqlite;
    const scalar = (statement: string, ...params: unknown[]): number => {
      const row = sqlite.prepare(statement).get(...(params as never[])) as
        | { value: number | null }
        | undefined;
      return Number(row?.value ?? 0);
    };

    const answeredToday = scalar(
      'SELECT COUNT(*) AS value FROM review_logs WHERE user_id = ? AND answered_at >= ?',
      userId,
      dayStart,
    );
    const correctToday = scalar(
      'SELECT COUNT(*) AS value FROM review_logs WHERE user_id = ? AND answered_at >= ? AND is_correct = 1',
      userId,
      dayStart,
    );
    const averageDurationMsToday = scalar(
      'SELECT CAST(AVG(duration_ms) AS INTEGER) AS value FROM review_logs WHERE user_id = ? AND answered_at >= ?',
      userId,
      dayStart,
    );
    const masteredWords = scalar(
      "SELECT COUNT(*) AS value FROM user_word_states WHERE user_id = ? AND status = 'mastered'",
      userId,
    );
    const learningWords = scalar(
      "SELECT COUNT(*) AS value FROM user_word_states WHERE user_id = ? AND status IN ('learning','review')",
      userId,
    );
    const notebookCount = scalar(
      'SELECT COUNT(*) AS value FROM user_notebook WHERE user_id = ?',
      userId,
    );

    const newWordRows = sqlite
      .prepare(
        `SELECT CAST(first_learned_at / ? AS INTEGER) AS day, COUNT(*) AS count
         FROM user_word_states
         WHERE user_id = ? AND first_learned_at >= ?
         GROUP BY day`,
      )
      .all(DAY_MS, userId, trendStart) as Array<{ day: number; count: number }>;

    // 复习量只统计「当天之前就已学过」的词的作答，避免与新学首答重复计数
    const reviewRows = sqlite
      .prepare(
        `SELECT CAST(rl.answered_at / ? AS INTEGER) AS day, COUNT(*) AS count
         FROM review_logs rl
         JOIN user_word_states s ON s.user_id = rl.user_id AND s.word_id = rl.word_id
         WHERE rl.user_id = ? AND rl.answered_at >= ?
           AND s.first_learned_at < CAST(rl.answered_at / ? AS INTEGER) * ?
         GROUP BY day`,
      )
      .all(DAY_MS, userId, trendStart, DAY_MS, DAY_MS) as Array<{ day: number; count: number }>;

    const newByDay = new Map(newWordRows.map((row) => [Number(row.day), Number(row.count)]));
    const reviewByDay = new Map(reviewRows.map((row) => [Number(row.day), Number(row.count)]));
    const dailyTrend: DailyTrendPoint[] = [];
    for (let index = 0; index < TREND_DAYS; index += 1) {
      const day = Math.floor(trendStart / DAY_MS) + index;
      dailyTrend.push({
        date: new Date(day * DAY_MS).toISOString().slice(0, 10),
        newWords: newByDay.get(day) ?? 0,
        reviews: reviewByDay.get(day) ?? 0,
      });
    }

    return {
      answeredToday,
      correctToday,
      // 没有作答时返回 null，避免前端把 0 当作「平均用时 0 秒」
      averageDurationMsToday: answeredToday > 0 ? averageDurationMsToday : null,
      learnedToday: await this.countNewLearnedSince(userId, dayStart),
      reviewedToday: await this.countReviewsSince(userId, dayStart),
      masteredWords,
      learningWords,
      notebookCount,
      dailyTrend,
    };
  }
}

function emptyErrorCounts(): Record<SpellingErrorType, number> {
  return { missing_letter: 0, duplicate_letter: 0, order_error: 0, wrong_letter: 0 };
}

function toStateRecord(row: typeof userWordStates.$inferSelect): UserWordStateRecord {
  return {
    userId: row.userId,
    wordId: row.wordId,
    status: row.status as WordStatus,
    easeFactor: row.easeFactor,
    intervalDays: row.intervalDays,
    repetitions: row.repetitions,
    lapses: row.lapses,
    dueAt: row.dueAt,
    lastReviewedAt: row.lastReviewedAt,
    firstLearnedAt: row.firstLearnedAt,
    totalReviews: row.totalReviews,
    correctReviews: row.correctReviews,
  };
}

function toLogRecord(row: typeof reviewLogs.$inferSelect): ReviewLogRecord {
  return {
    id: row.id,
    userId: row.userId,
    wordId: row.wordId,
    eventId: row.eventId,
    questionType: row.questionType as QuestionType,
    answerRaw: row.answerRaw,
    isCorrect: row.isCorrect === 1,
    rating: row.rating as ReviewRating,
    durationMs: row.durationMs,
    answeredAt: row.answeredAt,
    clientAnsweredAt: row.clientAnsweredAt,
    easeFactorAfter: row.easeFactorAfter,
    intervalDaysAfter: row.intervalDaysAfter,
    repetitionsAfter: row.repetitionsAfter,
    dueAtAfter: row.dueAtAfter,
    source: row.source,
  };
}

function emptyState(userId: string, wordId: string): UserWordStateRecord {
  return {
    userId,
    wordId,
    status: 'new',
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    dueAt: null,
    lastReviewedAt: null,
    firstLearnedAt: null,
    totalReviews: 0,
    correctReviews: 0,
  };
}
