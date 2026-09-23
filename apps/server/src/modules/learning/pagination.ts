import { ErrorCode } from '@leximochi/types';
import { AppError } from '../../common/errors/app-error';

/**
 * 分页游标：对客户端不透明（base64url + `|` 分隔的多个片段）。
 * 解析失败一律按参数非法处理（400），不猜测、不静默回退到首页。
 */
const PART_SEPARATOR = '|';
const MAX_PARTS = 4;

export function encodeCursor(parts: Array<string | number>): string {
  return Buffer.from(parts.join(PART_SEPARATOR), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string, expectedParts: number): string[] {
  const invalid = () => new AppError(ErrorCode.VALIDATION_FAILED, '分页游标无效', 400);

  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    throw invalid();
  }
  const parts = decoded.split(PART_SEPARATOR);
  if (parts.length !== expectedParts || expectedParts < 1 || expectedParts > MAX_PARTS) {
    throw invalid();
  }
  if (parts.some((part) => part.length === 0 || part.length > 64)) throw invalid();
  return parts;
}

/** 游标中的时间戳片段：必须是非负安全整数 */
export function parseCursorTimestamp(part: string): number {
  const value = Number(part);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AppError(ErrorCode.VALIDATION_FAILED, '分页游标无效', 400);
  }
  return value;
}
