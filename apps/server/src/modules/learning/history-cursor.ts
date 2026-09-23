import type { ReviewHistoryCursor } from './domain/learning.repository';
import { decodeCursor, encodeCursor, parseCursorTimestamp } from './pagination';

/**
 * 复习历史分页游标：内容为 `answeredAt|reviewLogId`，
 * 与列表排序 (answeredAt DESC, id DESC) 对应。
 */
export function formatHistoryCursor(cursor: ReviewHistoryCursor): string {
  return encodeCursor([cursor.answeredAt, cursor.id]);
}

export function parseHistoryCursor(raw: string): ReviewHistoryCursor {
  const [answeredAt, id] = decodeCursor(raw, 2) as [string, string];
  return { answeredAt: parseCursorTimestamp(answeredAt), id };
}
