import { AppError } from '../src/common/errors/app-error';
import { formatNotebookCursor, parseNotebookCursor } from '../src/modules/learning/notebook-cursor';

describe('生词本分页游标', () => {
  it('编码后可无损解析回来', () => {
    const cursor = { addedAt: 1_790_000_000_000, wordId: 'w-abandon' };
    expect(parseNotebookCursor(formatNotebookCursor(cursor))).toEqual(cursor);
  });

  it('游标对客户端不透明（不直接泄露内部字段）', () => {
    const encoded = formatNotebookCursor({ addedAt: 1, wordId: 'w-a' });
    expect(encoded).not.toContain('|');
    expect(encoded).not.toContain('w-a');
  });

  it.each([
    ['非 base64 内容', 'not-a-cursor!!!'],
    ['缺少分隔符', Buffer.from('1790000000000', 'utf8').toString('base64url')],
    ['时间不是数字', Buffer.from('abc|w-abandon', 'utf8').toString('base64url')],
    ['时间为负数', Buffer.from('-1|w-abandon', 'utf8').toString('base64url')],
    ['wordId 为空', Buffer.from('1790000000000|', 'utf8').toString('base64url')],
    ['wordId 过长', Buffer.from(`1790000000000|${'x'.repeat(65)}`, 'utf8').toString('base64url')],
  ])('非法游标被拒绝：%s', (_label, raw) => {
    expect(() => parseNotebookCursor(raw)).toThrow(AppError);
  });
});
