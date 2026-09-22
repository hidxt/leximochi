import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { ApiClient } from '@leximochi/api-client';
import type { AdminUserSummary } from '@leximochi/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatTime } from '../lib/api';

interface UsersPageProps {
  api: ApiClient;
}

export function UsersPage({ api }: UsersPageProps): ReactElement {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | 'active' | 'banned'>('');
  const [items, setItems] = useState<AdminUserSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingBan, setPendingBan] = useState<AdminUserSummary | null>(null);
  const [pendingUnban, setPendingUnban] = useState<AdminUserSummary | null>(null);

  const load = useCallback(
    async (options: { cursor?: string; append?: boolean } = {}) => {
      setError(null);
      try {
        const page = await api.admin.listUsers({
          query: query.trim() || undefined,
          status: status || undefined,
          limit: 20,
          cursor: options.cursor,
        });
        setItems((previous) =>
          options.append && previous ? [...previous, ...page.items] : page.items,
        );
        setNextCursor(page.nextCursor);
      } catch (caught) {
        setError(messageOf(caught));
        if (!options.append) setItems([]);
      }
    },
    [api, query, status],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmBan(reason: string): Promise<void> {
    if (!pendingBan) return;
    setBusy(true);
    try {
      await api.admin.banUser(pendingBan.id, { reason });
      setPendingBan(null);
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function confirmUnban(): Promise<void> {
    if (!pendingUnban) return;
    setBusy(true);
    try {
      await api.admin.unbanUser(pendingUnban.id);
      setPendingUnban(null);
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
          <h1 className="page__title">用户</h1>
          <p className="page__note">
            封禁会立即撤销该用户全部会话；解封后需重新登录。所有操作都会写入审计日志。
          </p>
        </div>
      </div>

      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor="user-query">
            用户名
          </label>
          <input
            id="user-query"
            type="search"
            value={query}
            placeholder="精确或部分匹配"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="user-status">
            状态
          </label>
          <select
            id="user-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as '' | 'active' | 'banned')}
          >
            <option value="">全部</option>
            <option value="active">正常</option>
            <option value="banned">已封禁</option>
          </select>
        </div>
        <button className="button" type="submit" disabled={busy}>
          检索
        </button>
      </form>

      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}

      {items === null ? (
        <p className="empty">正在读取…</p>
      ) : items.length === 0 ? (
        <p className="empty">没有符合条件的用户。</p>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>用户名</th>
                <th>状态</th>
                <th>角色</th>
                <th>注册时间</th>
                <th>最后登录</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.username}
                    <div className="mono" style={{ color: 'var(--ink-soft)' }}>
                      {item.id}
                    </div>
                  </td>
                  <td>
                    <span className={item.status === 'banned' ? 'tag tag--banned' : 'tag tag--active'}>
                      {item.status === 'banned' ? '已封禁' : '正常'}
                    </span>
                  </td>
                  <td className="mono">{item.roles.join(', ') || '—'}</td>
                  <td className="mono">{formatTime(item.createdAt)}</td>
                  <td className="mono">{formatTime(item.lastLoginAt)}</td>
                  <td>
                    {item.status === 'banned' ? (
                      <button
                        className="button button--quiet"
                        type="button"
                        disabled={busy}
                        onClick={() => setPendingUnban(item)}
                      >
                        解封
                      </button>
                    ) : (
                      <button
                        className="button button--danger"
                        type="button"
                        disabled={busy}
                        onClick={() => setPendingBan(item)}
                      >
                        封禁
                      </button>
                    )}
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
        open={pendingBan !== null}
        title={`封禁 ${pendingBan?.username ?? ''}`}
        description="该用户会立即被登出且无法再登录，直到被解封。请填写封禁原因，原因会进入审计日志。"
        requireReason
        confirmLabel="确认封禁"
        onConfirm={(input) => void confirmBan(input.reason)}
        onCancel={() => setPendingBan(null)}
      />

      <ConfirmDialog
        open={pendingUnban !== null}
        title={`解封 ${pendingUnban?.username ?? ''}`}
        description="解封后该用户可以重新登录，旧会话不会恢复。"
        confirmLabel="确认解封"
        onConfirm={() => void confirmUnban()}
        onCancel={() => setPendingUnban(null)}
      />
    </section>
  );
}

function messageOf(caught: unknown): string {
  if (caught && typeof caught === 'object' && 'message' in caught) {
    return String((caught as { message: unknown }).message);
  }
  return '操作失败，请稍后重试';
}
