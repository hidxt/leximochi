import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import type { ApiClient } from '@leximochi/api-client';
import type { ReviewStats, StudyMode, WordbookSummary } from '@leximochi/types';
import { Notice } from '../components/Notice';

interface WordsPageProps {
  api: ApiClient;
}

const ENTRY_MODES: Array<{ mode: StudyMode; title: string; hint: string }> = [
  { mode: 'new', title: '学新词', hint: '卡片式首学，先看释义与例句' },
  { mode: 'review', title: '到期复习', hint: '按记忆状态安排，错拼过的词优先' },
  { mode: 'spelling', title: '拼写训练', hint: '看释义写英文，错拼会被记录' },
  { mode: 'dictation', title: '听写训练', hint: '听音写词（需要音频资源）' },
];

/** 单词首页：选词库、选训练方式，并展示今日概况 */
export function WordsPage({ api }: WordsPageProps): ReactElement {
  const [wordbooks, setWordbooks] = useState<WordbookSummary[] | null>(null);
  const [bookKey, setBookKey] = useState<string>('');
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [books, current] = await Promise.all([api.vocabulary.listWordbooks(), api.review.stats()]);
      setWordbooks(books);
      setStats(current);
      setBookKey((previous) => previous || (books[0]?.key ?? ''));
      if (books.length === 0) setError('当前还没有可用词库，请先在后台导入词库数据。');
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = wordbooks?.find((book) => book.key === bookKey) ?? null;
  const query = bookKey ? `&book=${encodeURIComponent(bookKey)}` : '';

  return (
    <>
      <section className="card">
        <span className="seal">单词</span>
        <h1 className="title">今天练哪一项</h1>
        <p className="subtitle">
          学习、复习、拼写与听写都按服务端的学习进度安排；同一批词重复练习不会重复计分。
        </p>

        {error ? <Notice tone="error">{error}</Notice> : null}

        {wordbooks === null ? (
          <p className="mono">正在读取词库…</p>
        ) : (
          <label className="field">
            <span className="field__label">词库</span>
            <select
              id="wordbook"
              name="wordbookKey"
              className="field__input"
              value={bookKey}
              onChange={(event) => setBookKey(event.target.value)}
            >
              {wordbooks.map((book) => (
                <option key={book.key} value={book.key}>
                  {book.name}（{book.wordCount} 词）
                </option>
              ))}
            </select>
            <span className="field__hint">
              {selected
                ? `版本 v${selected.version}${selected.isSystem ? ' · 系统词库' : ''}`
                : '选择一个词库开始'}
            </span>
          </label>
        )}

        <div className="tally">
          {ENTRY_MODES.map((entry) => (
            <Link
              key={entry.mode}
              className="card"
              style={{ display: 'block', textDecoration: 'none' }}
              to={`/words/study?mode=${entry.mode}${query}`}
            >
              <div className="tally__value" style={{ fontSize: 18 }}>
                {entry.title}
              </div>
              <div className="tally__label">{entry.hint}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="card">
        <p className="section-label">今日概况</p>
        {stats === null ? (
          <p className="mono">正在读取…</p>
        ) : (
          <div className="tally">
            <div className="tally__cell">
              <div className="tally__value">{stats.learnedToday}</div>
              <div className="tally__label">今日新学</div>
            </div>
            <div className="tally__cell">
              <div className="tally__value">{stats.reviewedToday}</div>
              <div className="tally__label">今日复习</div>
            </div>
            <div className="tally__cell">
              <div className="tally__value">
                {stats.accuracyToday === null ? '—' : `${Math.round(stats.accuracyToday * 100)}%`}
              </div>
              <div className="tally__label">今日正确率</div>
            </div>
            <div className="tally__cell">
              <div className="tally__value">{stats.masteredWords}</div>
              <div className="tally__label">已掌握</div>
            </div>
          </div>
        )}
        <div className="button-row">
          <Link className="button button--quiet" to="/notebook">
            生词本（{stats?.notebookCount ?? '…'}）
          </Link>
          <Link className="button button--quiet" to="/stats">
            学习统计
          </Link>
        </div>
      </section>
    </>
  );
}

function messageOf(caught: unknown): string {
  if (caught && typeof caught === 'object' && 'message' in caught) {
    return String((caught as { message: unknown }).message);
  }
  return '操作失败，请稍后重试';
}
