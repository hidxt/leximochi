import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { AdminWordbookDetail, ApiClient } from '@leximochi/api-client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatTime } from '../lib/api';

interface WordbooksPageProps {
  api: ApiClient;
}

/** 词库管理：列表、新建、改元数据、删除（高风险，二次确认） */
export function WordbooksPage({ api }: WordbooksPageProps): ReactElement {
  const [items, setItems] = useState<AdminWordbookDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminWordbookDetail | null>(null);
  const [editing, setEditing] = useState<AdminWordbookDetail | null>(null);

  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSystem, setIsSystem] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await api.admin.vocabulary.listWordbooks());
    } catch (caught) {
      setError(messageOf(caught));
      setItems([]);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.admin.vocabulary.createWordbook({
        key: key.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        isSystem,
      });
      setKey('');
      setName('');
      setDescription('');
      setIsSystem(false);
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(): Promise<void> {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.vocabulary.updateWordbook(editing.id, {
        name: editing.name,
        description: editing.description ?? undefined,
        isSystem: editing.isSystem,
      });
      setEditing(null);
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
      await api.admin.vocabulary.deleteWordbook(pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">词库</h1>
          <p className="page__note">
            词库与词条是纯数据：新增词库不需要改代码。词条在词库间共享，删除词库只解除关联，不会删除词条本身。
          </p>
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
          if (!busy && key.trim() && name.trim()) void handleCreate();
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor="book-key">
            key（小写字母/数字/_/-）
          </label>
          <input
            id="book-key"
            value={key}
            placeholder="postgrad-2026"
            onChange={(event) => setKey(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="book-name">
            名称
          </label>
          <input id="book-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="book-desc">
            描述（可选）
          </label>
          <input
            id="book-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={isSystem}
            onChange={(event) => setIsSystem(event.target.checked)}
          />
          标记为系统词库
        </label>
        <button className="button" type="submit" disabled={busy || !key.trim() || !name.trim()}>
          新建词库
        </button>
      </form>

      {items === null ? (
        <p className="empty">正在读取…</p>
      ) : items.length === 0 ? (
        <p className="empty">还没有词库。可以先新建一个，再用批量导入写入词条。</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>key</th>
              <th>名称</th>
              <th>词数</th>
              <th>版本</th>
              <th>类型</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((book) => (
              <tr key={book.id}>
                <td className="mono">{book.key}</td>
                <td>
                  {book.name}
                  {book.description ? (
                    <div className="mono" style={{ color: 'var(--ink-soft)' }}>
                      {book.description}
                    </div>
                  ) : null}
                </td>
                <td className="mono">{book.wordCount}</td>
                <td className="mono">v{book.version}</td>
                <td>
                  <span className={book.isSystem ? 'tag tag--active' : 'tag'}>
                    {book.isSystem ? '系统' : '自定义'}
                  </span>
                </td>
                <td className="mono">{formatTime(book.updatedAt)}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="button button--quiet"
                    type="button"
                    disabled={busy}
                    onClick={() => setEditing(book)}
                  >
                    编辑
                  </button>
                  <button
                    className="button button--danger"
                    type="button"
                    disabled={busy}
                    onClick={() => setPendingDelete(book)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`删除词库 ${pendingDelete?.name ?? ''}`}
        description="删除后该词库将不再出现在客户端；词条本身保留在库中，如果没有任何词库引用它们，需要单独清理。"
        confirmLabel="确认删除词库"
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDelete(null)}
      />

      {editing ? (
        <div className="dialog-backdrop" role="presentation">
          <div className="dialog" role="dialog" aria-modal="true" aria-label="编辑词库">
            <h2 className="dialog__title">编辑 {editing.key}</h2>
            <div className="field">
              <label className="field__label" htmlFor="edit-book-name">
                名称
              </label>
              <input
                id="edit-book-name"
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="edit-book-desc">
                描述
              </label>
              <input
                id="edit-book-desc"
                value={editing.description ?? ''}
                onChange={(event) => setEditing({ ...editing, description: event.target.value })}
              />
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={editing.isSystem}
                onChange={(event) => setEditing({ ...editing, isSystem: event.target.checked })}
              />
              标记为系统词库
            </label>
            <p className="page__note">元数据变化不会改变版本号；版本号只随词条内容变化递增。</p>
            <div className="dialog__actions">
              <button className="button button--quiet" type="button" onClick={() => setEditing(null)}>
                取消
              </button>
              <button className="button" type="button" disabled={busy} onClick={() => void handleUpdate()}>
                保存
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
