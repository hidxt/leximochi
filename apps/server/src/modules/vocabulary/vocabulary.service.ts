import { Inject, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type WordDetail,
  type WordPage,
  type WordbookSummary,
  type WordbookVersionInfo,
} from '@leximochi/types';
import { AppError } from '../../common/errors/app-error';
import {
  WORDBOOK_REPOSITORY,
  type WordbookRepository,
} from './domain/wordbook.repository';
import {
  WORD_REPOSITORY,
  type WordRepository,
  type WordSearchItem,
} from './domain/word.repository';

export interface ExportWordsQuery {
  cursor?: string;
  limit?: number;
}

export interface SearchWordsQuery {
  q: string;
  wordbookKey?: string;
  limit?: number;
}

@Injectable()
export class VocabularyService {
  constructor(
    @Inject(WORDBOOK_REPOSITORY) private readonly wordbooks: WordbookRepository,
    @Inject(WORD_REPOSITORY) private readonly words: WordRepository,
  ) {}

  async listWordbooks(): Promise<WordbookSummary[]> {
    const books = await this.wordbooks.list();
    return books.map((book) => ({
      id: book.id,
      key: book.key,
      name: book.name,
      description: book.description,
      language: book.language,
      version: book.version,
      wordCount: book.wordCount,
      isSystem: book.isSystem,
    }));
  }

  async getVersion(key: string): Promise<WordbookVersionInfo> {
    const book = await this.requireWordbook(key);
    return { key: book.key, version: book.version, wordCount: book.wordCount, updatedAt: book.updatedAt };
  }

  async exportWords(key: string, query: ExportWordsQuery): Promise<WordPage> {
    const book = await this.requireWordbook(key);
    return this.words.listByWordbook(book.id, {
      cursor: query.cursor,
      limit: query.limit ?? 50,
    });
  }

  async getWordDetail(wordId: string, userId: string): Promise<WordDetail> {
    const detail = await this.words.findDetailById(wordId);
    if (!detail) {
      throw new AppError(ErrorCode.WORD_NOT_FOUND, '词条不存在', 404);
    }
    const state = await this.words.findUserState(userId, wordId);
    return { ...detail, state };
  }

  async searchWords(query: SearchWordsQuery): Promise<WordSearchItem[]> {
    let wordbookId: string | undefined;
    if (query.wordbookKey) {
      wordbookId = (await this.requireWordbook(query.wordbookKey)).id;
    }
    return this.words.search(query.q, { wordbookId, limit: query.limit ?? 20 });
  }

  private async requireWordbook(key: string) {
    const book = await this.wordbooks.findByKey(key);
    if (!book) {
      throw new AppError(ErrorCode.WORDBOOK_NOT_FOUND, '词库不存在', 404);
    }
    return book;
  }
}
