import type { NotebookSource } from '@leximochi/types';

export const NOTEBOOK_REPOSITORY = 'NOTEBOOK_REPOSITORY';

export interface NotebookEntryRecord {
  wordId: string;
  headword: string;
  definitionZh: string | null;
  note: string | null;
  source: NotebookSource;
  addedAt: number;
}

/** 生词本分页游标：按 (addedAt DESC, wordId ASC) 排序，游标为上一页最后一条 */
export interface NotebookCursor {
  addedAt: number;
  wordId: string;
}

export interface AddNotebookInput {
  userId: string;
  wordId: string;
  note: string | null;
  source: NotebookSource;
  addedAt: number;
}

export interface NotebookRepository {
  /** 幂等加入：已存在时返回原条目且 created=false（不覆盖用户原有备注） */
  add(input: AddNotebookInput): Promise<{ entry: NotebookEntryRecord; created: boolean }>;
  /** 移除；返回 false 表示该用户没有这条记录（越权与不存在同等对待） */
  remove(userId: string, wordId: string): Promise<boolean>;
  findEntry(userId: string, wordId: string): Promise<NotebookEntryRecord | null>;
  /** 分页列出：所有查询都以 user_id 限定，避免越权读到他人数据 */
  list(
    userId: string,
    page: { cursor?: NotebookCursor; limit: number },
  ): Promise<{ items: NotebookEntryRecord[]; nextCursor: NotebookCursor | null }>;
  count(userId: string): Promise<number>;
}
