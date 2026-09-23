import type { NotebookCursor } from './domain/notebook.repository';
import { decodeCursor, encodeCursor, parseCursorTimestamp } from './pagination';

/**
 * 生词本分页游标：内容为 `addedAt|wordId`，
 * 与列表排序 (addedAt DESC, wordId ASC) 对应。
 */
export function formatNotebookCursor(cursor: NotebookCursor): string {
  return encodeCursor([cursor.addedAt, cursor.wordId]);
}

export function parseNotebookCursor(raw: string): NotebookCursor {
  const [addedAt, wordId] = decodeCursor(raw, 2) as [string, string];
  return { addedAt: parseCursorTimestamp(addedAt), wordId };
}
