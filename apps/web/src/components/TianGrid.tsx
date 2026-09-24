import type { ReactElement } from 'react';

/**
 * 田字格：习字练习格，本模块的签名元素。
 * 题面与答案都在这张「格子纸」里呈现，答完由 `stamp` 落一枚朱砂印章。
 */
export function TianGrid({
  text,
  variant = 'prompt',
  stamp,
}: {
  text: string;
  variant?: 'prompt' | 'answer' | 'missing';
  stamp?: boolean | null;
}): ReactElement {
  // 字数越多字号越小，保证长单词/长释义不溢出格子
  const fontSize = Math.max(18, Math.min(44, Math.floor(196 / Math.max(1, Math.min(text.length, 12)))));

  return (
    <div className={`tian${variant === 'answer' ? ' tian--answer' : ''}${variant === 'missing' ? ' tian--missing' : ''}`}>
      <span className="tian__text" style={{ fontSize }} data-testid="tian-text">
        {text}
      </span>
      {stamp === null || stamp === undefined ? null : (
        <span
          className={`stamp${stamp ? ' stamp--right' : ' stamp--wrong'}`}
          role="status"
          data-testid="stamp"
        >
          {stamp ? '对' : '错'}
        </span>
      )}
    </div>
  );
}
