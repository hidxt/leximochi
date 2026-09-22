import type { ReactElement } from 'react';

interface NoticeProps {
  tone?: 'neutral' | 'error' | 'success';
  children: string;
}

export function Notice({ tone = 'neutral', children }: NoticeProps): ReactElement {
  const toneClass = tone === 'neutral' ? '' : ` notice--${tone}`;
  return (
    <p className={`notice${toneClass}`} role={tone === 'error' ? 'alert' : undefined}>
      {children}
    </p>
  );
}
