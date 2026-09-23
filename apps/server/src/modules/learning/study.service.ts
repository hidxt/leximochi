import { Inject, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  QuestionType,
  StudyMode,
  type StudyNextResponse,
  type StudyProgressDto,
  type StudyQuestionDto,
} from '@leximochi/types';
import { DEFAULT_DAILY_NEW_TARGET } from '@leximochi/types';
import { MISSPELL_PRIORITY_WINDOW_DAYS } from '@leximochi/core';
import { AppError } from '../../common/errors/app-error';
import {
  WORDBOOK_REPOSITORY,
  type WordbookRecord,
  type WordbookRepository,
} from '../vocabulary/domain/wordbook.repository';
import {
  WORD_REPOSITORY,
  type WordDetailRecord,
  type WordRepository,
} from '../vocabulary/domain/word.repository';
import {
  LEARNING_REPOSITORY,
  type LearningRepository,
} from './domain/learning.repository';
import { buildQuestion, hasAudio, pickReviewQuestionType } from './question-factory';

const DAY_MS = 24 * 60 * 60 * 1000;
const REVIEW_CANDIDATE_LIMIT = 50;
const RECENT_MISSPELL_WINDOW_MS = MISSPELL_PRIORITY_WINDOW_DAYS * DAY_MS;
const DISTRACTOR_POOL = 30;
const OPTION_COUNT = 4;

export interface StudyNextCommand {
  mode: StudyMode;
  wordbookKey?: string;
}

@Injectable()
export class StudyService {
  constructor(
    @Inject(LEARNING_REPOSITORY) private readonly learning: LearningRepository,
    @Inject(WORDBOOK_REPOSITORY) private readonly wordbooks: WordbookRepository,
    @Inject(WORD_REPOSITORY) private readonly words: WordRepository,
  ) {}

  /**
   * 取下一题。
   *
   * 选词策略：
   * - `new`：指定/默认词库中**尚未学过**的词，按词库 rank 升序；受每日新词目标约束
   * - `review`：已到期的词，**近期错拼过的优先**，其余按逾期时长排序
   * - `spelling`：从已学过的词中出拼写题
   * - `dictation`：从已学过且有音频的词中出听写题；**没有音频时明确告知不可用**
   */
  async next(userId: string, command: StudyNextCommand): Promise<StudyNextResponse> {
    // 进度里的「还剩多少新词」需要词库上下文：非新词模式用默认词库
    const book = await this.resolveWordbook(command.wordbookKey);
    const progress = await this.buildProgress(userId, book.id);

    switch (command.mode) {
      case StudyMode.New: {
        if (progress.learnedToday >= progress.dailyNewTarget) {
          return {
            question: null,
            progress,
            notice: `今天的新词目标（${progress.dailyNewTarget} 个）已完成，可以继续复习或做拼写训练`,
          };
        }
        const candidateIds = await this.words.listNewWordIdsForWordbook(userId, book.id, 1);
        const wordId = candidateIds[0];
        if (!wordId) {
          return { question: null, progress, notice: '这个词库的新词都学完了，继续复习巩固吧' };
        }
        const word = await this.requireWord(wordId);
        return {
          question: await this.buildForWord(word, QuestionType.DefinitionChoice, command.mode, book.id),
          progress,
          notice: null,
        };
      }

      case StudyMode.Review: {
        const dueIds = await this.learning.listDueWordIds(userId, Date.now(), REVIEW_CANDIDATE_LIMIT);
        if (dueIds.length === 0) {
          return { question: null, progress, notice: null };
        }
        const misspelled = new Set(
          await this.learning.listRecentlyMisspelledWordIds(
            userId,
            Date.now() - RECENT_MISSPELL_WINDOW_MS,
            REVIEW_CANDIDATE_LIMIT,
          ),
        );
        // 错拼加权：近期错拼过的词优先出现；组内保持原有到期顺序
        const ordered = [
          ...dueIds.filter((id) => misspelled.has(id)),
          ...dueIds.filter((id) => !misspelled.has(id)),
        ];
        const word = await this.requireWord(ordered[0]!);
        return {
          question: await this.buildForWord(
            word,
            pickReviewQuestionType(word.id),
            command.mode,
            undefined,
          ),
          progress,
          notice: null,
        };
      }

      case StudyMode.Spelling: {
        const learnedIds = await this.learning.listLearnedWordIds(userId, REVIEW_CANDIDATE_LIMIT);
        const wordId = learnedIds[0];
        if (!wordId) {
          return { question: null, progress, notice: '开始学习一些新词后，就能练习拼写了' };
        }
        const word = await this.requireWord(wordId);
        return {
          question: await this.buildForWord(word, QuestionType.Spelling, command.mode, undefined),
          progress,
          notice: null,
        };
      }

      case StudyMode.Dictation: {
        const learnedIds = await this.learning.listLearnedWordIds(userId, REVIEW_CANDIDATE_LIMIT);
        for (const wordId of learnedIds) {
          const word = await this.words.findDetailById(wordId);
          if (!word || !hasAudio(word)) continue;
          return {
            question: await this.buildForWord(
              word,
              QuestionType.ListeningDictation,
              command.mode,
              undefined,
            ),
            progress,
            notice: null,
          };
        }
        return {
          question: null,
          progress,
          // 明确告知缺少什么能力，不静默失败
          notice: '当前词库还没有音频资源，听写暂不可用；可以先做拼写训练。',
        };
      }

      default:
        throw new AppError(ErrorCode.VALIDATION_FAILED, '不支持的练习模式', 400);
    }
  }

  private async buildForWord(
    word: WordDetailRecord,
    questionType: QuestionType,
    mode: StudyMode,
    wordbookId: string | undefined,
  ): Promise<StudyQuestionDto> {
    const distractors =
      questionType === QuestionType.DefinitionChoice
        ? await this.words.listDistractorDefinitions({
            wordbookId,
            excludeWordId: word.id,
            limit: DISTRACTOR_POOL,
          })
        : [];
    return buildQuestion({ word, questionType, mode, distractors, optionCount: OPTION_COUNT });
  }

  private async buildProgress(userId: string, wordbookId: string): Promise<StudyProgressDto> {
    const now = Date.now();
    const dayStart = startOfUtcDay(now);
    const [dueRemaining, learnedToday, reviewedToday, newRemaining] = await Promise.all([
      this.learning.countDue(userId, now),
      this.learning.countNewLearnedSince(userId, dayStart),
      this.learning.countReviewsSince(userId, dayStart),
      this.words.countNewWordsForWordbook(userId, wordbookId),
    ]);
    return {
      // 还剩多少「没学过」的新词（用于展示进度），每日新词目标单独由 dailyNewTarget 表达
      newRemaining,
      dueRemaining,
      learnedToday,
      reviewedToday,
      dailyNewTarget: DEFAULT_DAILY_NEW_TARGET,
    };
  }

  private async requireWord(wordId: string): Promise<WordDetailRecord> {
    const word = await this.words.findDetailById(wordId);
    if (!word) {
      throw new AppError(ErrorCode.WORD_NOT_FOUND, '词条不存在', 404);
    }
    return word;
  }

  /** 未指定词库时取默认（系统词库优先，其次按名称），供新词学习使用 */
  private async resolveWordbook(key: string | undefined): Promise<WordbookRecord> {
    if (key) {
      const book = await this.wordbooks.findByKey(key);
      if (!book) {
        throw new AppError(ErrorCode.WORDBOOK_NOT_FOUND, '词库不存在', 404);
      }
      return book;
    }
    const books = await this.wordbooks.list();
    const first = books[0];
    if (!first) {
      throw new AppError(ErrorCode.WORDBOOK_NOT_FOUND, '当前没有可用词库', 404);
    }
    return first;
  }
}

function startOfUtcDay(timestamp: number): number {
  return Math.floor(timestamp / DAY_MS) * DAY_MS;
}
