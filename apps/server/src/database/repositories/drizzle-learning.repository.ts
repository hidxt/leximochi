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
  LearningRepository,
  ReviewLogRecord,
  SpellingErrorGroupRecord,
  UserWordStateRecord,
} from '../../modules/learning/domain/learning.repository';

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
