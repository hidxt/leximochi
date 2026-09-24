import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import type { ApiClient } from '@leximochi/api-client';
import type { NotebookEntry, WordSearchItem } from '@leximochi/types';
import { Notice } from '../components/Notice';

interface NotebookPageProps {
  api: ApiClient;
}

/** 生词本：查看与移除已收藏的词，也可以按词形搜索加入 */
export function NotebookPage({ api }: NotebookPageProps): ReactElement {
  const [entries, setEntries] = useState<NotebookEntry[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WordSearchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await api.notebook.list({ limit: 50 });
      setEntries(page.items);
      setTotal(page.items.length);
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSearch(): Promise<void> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResults(await api.vocabulary.searchWords({ q: trimmed, limit: 10 }));
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(wordId: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.notebook.add({ wordId });
      setResults([]);
      setQuery('');
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(wordId: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.notebook.remove(wordId);
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <span className="seal">生词本</span>
        <h1 className="title">收藏 {total} 个词</h1>
        <p className="subtitle">
          生词本里的词不会自动进入复习队列，需要时到「单词」页开启复习练习。
        </p>

        {error ? <Notice tone="error">{error}</Notice> : null}

        <div className="answer-row">
          <label className="field">
            <span className="field__label">搜词加入</span>
            <input
              id="notebook-search"
              name="q"
              className="field__input"
              value={query}
              placeholder="输入英文单词，例如 abandon"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleSearch();
              }}
            />
          </label>
          <button className="button button--quiet" type="button" disabled={busy} onClick={() => void handleSearch()}>
            搜索
          </button>
        </div>

        {results.length > 0 ? (
          <div className="rows">
            {results.map((item) => (
              <div className="row" key={item.id}>
                <div>
                  <div className="row__word">{item.headword}</div>
                  <div className="row__meta">{item.definitionZh ?? '（暂无中文释义）'}</div>
                </div>
                <button
                  className="button button--quiet"
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAdd(item.id)}
                >
                  加入生词本
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card">
        <p className="section-label">已收藏</p>
        {entries === null ? (
          <p className="mono">正在读取…</p>
        ) : entries.length === 0 ? (
          <p className="subtitle">
            还没有收藏任何词。练习中答错的词可以直接加入，也可以在上面搜索加入。
          </p>
        ) : (
          <div className="rows">
            {entries.map((entry) => (
              <div className="row" key={entry.wordId}>
                <div>
                  <div className="row__word">{entry.headword}</div>
                  <div className="row__meta">
                    {entry.definitionZh ?? '（暂无中文释义）'}
                    {entry.note ? ` · 备注：${entry.note}` : ''} · {formatDate(entry.addedAt)}
                  </div>
                </div>
                <button
                  className="button button--danger"
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRemove(entry.wordId)}
                >
                  移出
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="button-row">
          <Link className="button button--quiet" to="/words">
            去练习
          </Link>
        </div>
      </section>
    </>
  );
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

function messageOf(caught: unknown): string {
  if (caught && typeof caught === 'object' && 'message' in caught) {
    return String((caught as { message: unknown }).message);
  }
  return '操作失败，请稍后重试';
}
