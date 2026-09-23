import { Inject, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  NotebookSource,
  type NotebookAddResponse,
  type NotebookEntry,
  type NotebookPage,
} from '@leximochi/types';
import { AppError } from '../../common/errors/app-error';
import {
  WORD_REPOSITORY,
  type WordRepository,
} from '../vocabulary/domain/word.repository';
import {
  NOTEBOOK_REPOSITORY,
  type NotebookEntryRecord,
  type NotebookRepository,
} from './domain/notebook.repository';
import { formatNotebookCursor, parseNotebookCursor } from './notebook-cursor';

const DEFAULT_NOTEBOOK_LIMIT = 30;

export interface AddNotebookCommand {
  wordId: string;
  note?: string;
  source?: NotebookSource;
}

export interface ListNotebookQuery {
  cursor?: string;
  limit?: number;
}

@Injectable()
export class NotebookService {
  constructor(
    @Inject(NOTEBOOK_REPOSITORY) private readonly notebook: NotebookRepository,
    @Inject(WORD_REPOSITORY) private readonly words: WordRepository,
  ) {}

  /** 幂等加入：同一用户重复加入同一个词不会重复写入，也不会覆盖原有备注 */
  async add(userId: string, command: AddNotebookCommand): Promise<NotebookAddResponse> {
    const word = await this.words.findDetailById(command.wordId);
    if (!word) {
      throw new AppError(ErrorCode.WORD_NOT_FOUND, '词条不存在', 404);
    }
    const { entry, created } = await this.notebook.add({
      userId,
      wordId: command.wordId,
      note: command.note?.trim() ? command.note.trim() : null,
      source: command.source ?? NotebookSource.Manual,
      addedAt: Date.now(),
    });
    return { entry: toEntryDto(entry), created };
  }

  async list(userId: string, query: ListNotebookQuery): Promise<NotebookPage> {
    const cursor = query.cursor ? parseNotebookCursor(query.cursor) : undefined;
    const page = await this.notebook.list(userId, {
      cursor,
      limit: query.limit ?? DEFAULT_NOTEBOOK_LIMIT,
    });
    return {
      items: page.items.map(toEntryDto),
      nextCursor: page.nextCursor ? formatNotebookCursor(page.nextCursor) : null,
    };
  }

  /** 移除自己的条目；不存在或属于他人一律 404（不泄露他人数据是否存在） */
  async remove(userId: string, wordId: string): Promise<void> {
    const removed = await this.notebook.remove(userId, wordId);
    if (!removed) {
      throw new AppError(ErrorCode.NOTEBOOK_ENTRY_NOT_FOUND, '生词本中没有这个词', 404);
    }
  }
}

function toEntryDto(entry: NotebookEntryRecord): NotebookEntry {
  return {
    wordId: entry.wordId,
    headword: entry.headword,
    definitionZh: entry.definitionZh,
    note: entry.note,
    source: entry.source,
    addedAt: entry.addedAt,
  };
}
