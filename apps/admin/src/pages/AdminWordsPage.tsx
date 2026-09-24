import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { AdminWordbookDetail, ApiClient, ImportWordsResult } from '@leximochi/api-client';
import type { AdminWordListItem, WordDetail } from '@leximochi/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { WordEditor } from '../components/WordEditor';
import { formatTime } from '../lib/api';

interface AdminWordsPageProps {
  api: ApiClient;
}

/**
 * 词条管理：检索、新建/编辑、删除、批量导入（逐条结果）、音频上传。
 * 所有写操作都由服务端校验权限并写入审计日志。
 */
export function AdminWordsPage({ api }: AdminWordsPageProps): ReactElement {
  const [wordbooks, setWordbooks] = useState<AdminWordbookDetail[]>([]);
  const [bookId, setBookId] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AdminWordListItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<WordDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminWordListItem | null>(null);
  const [audioTarget, setAudioTarget] = useState<AdminWordListItem | null>(null);
  const [audioKind, setAudioKind] = useState<'uk' | 'us'>('uk');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importKey, setImportKey] = useState('');
  const [importName, setImportName] = useState('');
  const [importResult, setImportResult] = useState<ImportWordsResult | null>(null);

  const load = useCallback(
    async (options: { cursor?: string; append?: boolean } = {}) => {
      setError(null);
      try {
        const page = await api.admin.vocabulary.listWords({
          query: query.trim() || undefined,
          wordbookId: bookId || undefined,
          limit: 20,
          cursor: options.cursor,
        });
        setItems((previous) => (options.append && previous ? [...previous, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      } catch (caught) {
        setError(messageOf(caught));
        if (!options.append) setItems([]);
      }
    },
    [api, bookId, query],
  );

  useEffect(() => {
    void (async () => {
      try {
        const books = await api.admin.vocabulary.listWordbooks();
        setWordbooks(books);
        setBookId((previous) => previous || (books[0]?.id ?? ''));
      } catch (caught) {
        setError(messageOf(caught));
      }
    })();
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openEditor(id: string): Promise<void> {
    setError(null);
    try {
      setEditing(await api.admin.vocabulary.getWord(id));
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  async function handleSave(input: Parameters<typeof api.admin.vocabulary.createWord>[0]): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await api.admin.vocabulary.updateWord(editing.id, input);
      } else {
        await api.admin.vocabulary.createWord({ ...input, wordbookId: bookId });
      }
      setEditing(null);
      setCreating(false);
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!pendingDelete) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.vocabulary.deleteWord(pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(): Promise<void> {
    setBusy(true);
    setError(null);
    setImportResult(null);
    try {
      const parsed = JSON.parse(importText) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error('导入内容必须是 JSON 数组');
      }
      const result = await api.admin.vocabulary.importWords({
        wordbookKey: importKey.trim(),
        wordbookName: importName.trim(),
        items: parsed as Array<Record<string, unknown>>,
      });
      setImportResult(result);
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(file: File, kind: 'uk' | 'us'): Promise<void> {
    if (!audioTarget) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.vocabulary.uploadWordAudio(audioTarget.id, kind, file);
      setAudioTarget(null);
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  if (editing || creating) {
    return (
      <section className="page">
        <div className="page__head">
          <div>
            <h1 className="page__title">{editing ? `编辑 ${editing.headword}` : '新建词条'}</h1>
          </div>
        </div>
        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}
        <WordEditor
          initial={editing}
          submitting={busy}
          onSubmit={(input) => void handleSave({ ...input, wordbookId: bookId })}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">词条</h1>
          <p className="page__note">
            词典数据与 AI 补充内容分开存储；删除词条会同时从所有引用它的词库移除，并让这些词库的版本号递增。
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="button button--quiet" type="button" disabled={busy} onClick={() => setImportOpen(true)}>
            批量导入
          </button>
          <button
            className="button"
            type="button"
            disabled={busy || !bookId}
            onClick={() => setCreating(true)}
          >
            新建词条
          </button>
        </div>
      </div>

      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}

      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor="word-query">
            关键词
          </label>
          <input
            id="word-query"
            type="search"
            value={query}
            placeholder="匹配词形或释义"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="word-book">
            词库
          </label>
          <select id="word-book" value={bookId} onChange={(event) => setBookId(event.target.value)}>
            <option value="">全部词库</option>
            {wordbooks.map((book) => (
              <option key={book.id} value={book.id}>
                {book.name}（{book.wordCount}）
              </option>
            ))}
          </select>
        </div>
        <button className="button" type="submit" disabled={busy}>
          检索
        </button>
      </form>

      {items === null ? (
        <p className="empty">正在读取…</p>
      ) : items.length === 0 ? (
        <p className="empty">没有符合条件的词条。</p>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>词形</th>
                <th>首条释义</th>
                <th>音标</th>
                <th>音频</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="mono">{item.headword}</td>
                  <td>
                    {item.definitionZh ?? '—'}
                    <div className="mono" style={{ color: 'var(--ink-soft)' }}>
                      {item.senseCount} 条释义
                    </div>
                  </td>
                  <td className="mono">{item.phoneticUk ?? item.phoneticUs ?? '—'}</td>
                  <td>
                    <span className={item.hasAudio ? 'tag tag--active' : 'tag'}>
                      {item.hasAudio ? '有' : '无'}
                    </span>
                  </td>
                  <td className="mono">{formatTime(item.updatedAt)}</td>
                  <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="button button--quiet"
                      type="button"
                      disabled={busy}
                      onClick={() => void openEditor(item.id)}
                    >
                      编辑
                    </button>
                    <button
                      className="button button--quiet"
                      type="button"
                      disabled={busy}
                      onClick={() => setAudioTarget(item)}
                    >
                      传音频
                    </button>
                    <button
                      className="button button--danger"
                      type="button"
                      disabled={busy}
                      onClick={() => setPendingDelete(item)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {nextCursor ? (
            <div style={{ marginTop: 12 }}>
              <button
                className="button button--quiet"
                type="button"
                disabled={busy}
                onClick={() => void load({ cursor: nextCursor, append: true })}
              >
                加载更多
              </button>
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`删除词条 ${pendingDelete?.headword ?? ''}`}
        description="词条在多个词库间共享，删除会同时从所有词库移除，并让这些词库版本号递增。该操作不可撤销。"
        confirmLabel="确认删除词条"
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDelete(null)}
      />

      {audioTarget ? (
        <div className="dialog-backdrop" role="presentation">
          <div className="dialog" role="dialog" aria-modal="true" aria-label="上传音频">
            <h2 className="dialog__title">上传发音：{audioTarget.headword}</h2>
            <p className="dialog__description">
              支持 .mp3 / .m4a / .ogg，单个文件不超过 5MB。服务端会校验文件真实类型，扩展名与内容不一致会被拒绝。
            </p>
            <div className="filters">
              <div className="field">
                <label className="field__label" htmlFor="audio-kind">
                  发音类型
                </label>
                <select
                  id="audio-kind"
                  value={audioKind}
                  onChange={(event) => setAudioKind(event.target.value as 'uk' | 'us')}
                >
                  <option value="uk">英式（uk）</option>
                  <option value="us">美式（us）</option>
                </select>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="audio-file">
                  音频文件
                </label>
                <input
                  id="audio-file"
                  type="file"
                  accept=".mp3,.m4a,.ogg,audio/*"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleUpload(file, audioKind);
                  }}
                />
              </div>
            </div>
            <p className="page__note">
              上传成功后该词的音频 key 会被更新，所有包含它的词库版本号递增；词条不存在时服务端会返回 404。
            </p>
            <div className="dialog__actions">
              <button className="button button--quiet" type="button" onClick={() => setAudioTarget(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <div className="dialog-backdrop" role="presentation">
          <div className="dialog dialog--wide" role="dialog" aria-modal="true" aria-label="批量导入">
            <h2 className="dialog__title">批量导入词条</h2>
            <p className="dialog__description">
              整体在一个事务内完成；单条词条校验失败只跳过该条，其余正常入库，结果会逐条列出。
            </p>
            <div className="filters">
              <div className="field">
                <label className="field__label" htmlFor="import-key">
                  词库 key
                </label>
                <input
                  id="import-key"
                  value={importKey}
                  placeholder="postgrad-2026"
                  onChange={(event) => setImportKey(event.target.value)}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="import-name">
                  词库名称
                </label>
                <input
                  id="import-name"
                  value={importName}
                  onChange={(event) => setImportName(event.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="import-items">
                JSON 数组
              </label>
              <textarea
                id="import-items"
                rows={8}
                value={importText}
                placeholder={'[{"headword":"brief","senses":[{"partOfSpeech":"adj.","definitionZh":"简短的"}]}]'}
                onChange={(event) => setImportText(event.target.value)}
              />
            </div>

            {importResult ? (
              <div className="stack">
                <p className="notice notice--success">
                  新增 {importResult.created} 条，更新 {importResult.updated} 条，失败{' '}
                  {importResult.failed.length} 条；当前词库共 {importResult.wordCount} 词，版本 v
                  {importResult.version}。
                </p>
                {importResult.failed.length > 0 ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>序号</th>
                        <th>词形</th>
                        <th>原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.failed.map((failure) => (
                        <tr key={`${failure.index}-${failure.reason}`}>
                          <td className="mono">{failure.index}</td>
                          <td className="mono">{failure.headword ?? '—'}</td>
                          <td>{failure.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
            ) : null}

            <div className="dialog__actions">
              <button className="button button--quiet" type="button" onClick={() => setImportOpen(false)}>
                关闭
              </button>
              <button
                className="button"
                type="button"
                disabled={busy || !importKey.trim() || !importName.trim() || !importText.trim()}
                onClick={() => void handleImport()}
              >
                开始导入
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function messageOf(caught: unknown): string {
  if (caught && typeof caught === 'object' && 'message' in caught) {
    return String((caught as { message: unknown }).message);
  }
  return '操作失败，请稍后重试';
}
