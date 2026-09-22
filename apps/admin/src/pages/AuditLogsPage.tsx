import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { ApiClient } from '@leximochi/api-client';
import type { AuditLogEntry } from '@leximochi/types';
import { formatTime } from '../lib/api';

interface AuditLogsPageProps {
  api: ApiClient;
}

export function AuditLogsPage({ api }: AuditLogsPageProps): ReactElement {
  const [action, setAction] = useState('');
  const [items, setItems] = useState<AuditLogEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (options: { cursor?: string; append?: boolean } = {}) => {
      setError(null);
      try {
        const page = await api.admin.listAuditLogs({
          action: action.trim() || undefined,
          limit: 30,
          cursor: options.cursor,
        });
        setItems((previous) =>
          options.append && previous ? [...previous, ...page.items] : page.items,
        );
        setNextCursor(page.nextCursor);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '读取审计日志失败');
        if (!options.append) setItems([]);
      }
    },
    [api, action],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">审计日志</h1>
          <p className="page__note">
            记录管理员操作与敏感认证事件。日志为只读，不包含密码、恢复码或 Token。
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
          <label className="field__label" htmlFor="audit-action">
            动作
          </label>
          <input
            id="audit-action"
            type="search"
            value={action}
            placeholder="例如 admin.user.banned"
            onChange={(event) => setAction(event.target.value)}
          />
        </div>
        <button className="button" type="submit">
          查询
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
        <p className="empty">没有符合条件的日志。</p>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>动作</th>
                <th>操作者</th>
                <th>对象</th>
                <th>结果</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="mono">{formatTime(item.createdAt)}</td>
                  <td className="mono">{item.action}</td>
                  <td className="mono">
                    {item.actorType}
                    {item.actorUserId ? ` · ${item.actorUserId.slice(0, 8)}` : ''}
                  </td>
                  <td className="mono">
                    {item.targetType ?? '—'}
                    {item.targetId ? ` · ${item.targetId.slice(0, 8)}` : ''}
                  </td>
                  <td>
                    <span className={item.result === 'failure' ? 'tag tag--banned' : 'tag tag--active'}>
                      {item.result === 'success' ? '成功' : '失败'}
                    </span>
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
                onClick={() => void load({ cursor: nextCursor, append: true })}
              >
                加载更多
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
