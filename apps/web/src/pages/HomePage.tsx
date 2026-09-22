import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { ApiClient } from '@leximochi/api-client';
import type { SessionManager } from '@leximochi/auth';
import type { MeResponse, SessionSummary } from '@leximochi/types';
import { Notice } from '../components/Notice';

interface HomePageProps {
  api: ApiClient;
  session: SessionManager;
  me: MeResponse;
  onLoggedOut: () => void;
}

export function HomePage({ api, session, me, onLoggedOut }: HomePageProps): ReactElement {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await api.auth.listSessions());
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, [api]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function handleDelete(sessionId: string): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await api.auth.deleteSession(sessionId);
      await loadSessions();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout(): Promise<void> {
    setBusy(true);
    await session.logout();
    onLoggedOut();
  }

  async function handleLogoutAll(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await api.auth.logoutAll();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      await session.logout();
      onLoggedOut();
    }
  }

  const others = (sessions ?? []).filter((item) => !item.isCurrent);

  return (
    <>
      <section className="card">
        <span className="seal">已登录</span>
        <h1 className="title">{me.user.username}</h1>
        <p className="subtitle">账号建于 {formatDate(me.user.createdAt)}</p>

        {error ? <Notice tone="error">{error}</Notice> : null}

        <dl className="meta">
          <dt>身份</dt>
          <dd>{me.user.roles.includes('admin') ? '管理员' : '学习者'}</dd>
          <dt>账号状态</dt>
          <dd>{me.user.status === 'active' ? '正常' : '已封禁'}</dd>
          <dt>学习数据</dt>
          <dd>单词、口语、听力与宠物将在后续阶段接入，此处不展示占位数据。</dd>
        </dl>

        <div className="button-row">
          <button className="button button--quiet" type="button" disabled={busy} onClick={() => void handleLogout()}>
            退出登录
          </button>
          <button
            className="button button--danger"
            type="button"
            disabled={busy}
            onClick={() => void handleLogoutAll()}
          >
            退出全部设备
          </button>
        </div>
      </section>

      <section className="card">
        <p className="section-label">登录设备</p>
        <h2 className="title" style={{ fontSize: 22 }}>
          共 {sessions?.length ?? '…'} 个会话
        </h2>
        <p className="subtitle">
          发现不认识的设备时，删除该会话即可让它立即失效。删除后对方需重新登录。
        </p>

        {sessions === null ? (
          <p className="mono">正在读取…</p>
        ) : sessions.length === 0 ? (
          <p className="mono">当前没有活跃会话。</p>
        ) : (
          <>
            {sessions.map((item) => (
              <div className="session" key={item.id}>
                <div>
                  <div>
                    {item.isCurrent ? '本机（当前会话）' : '其他设备'}
                    {item.isCurrent ? <span className="seal" style={{ marginLeft: 8 }}>当前</span> : null}
                  </div>
                  <div className="session__meta">
                    {item.userAgent ?? '未知客户端'} · 最近活动 {formatDate(item.lastUsedAt ?? item.createdAt)}
                    {item.ip ? ` · ${item.ip}` : ''}
                  </div>
                </div>
                {item.isCurrent ? null : (
                  <button
                    className="button button--danger"
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDelete(item.id)}
                  >
                    删除会话
                  </button>
                )}
              </div>
            ))}
            {others.length === 0 ? (
              <p className="field__hint">目前只有这一台设备登录。</p>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function messageOf(caught: unknown): string {
  if (caught && typeof caught === 'object' && 'message' in caught) {
    return String((caught as { message: unknown }).message);
  }
  return '操作失败，请稍后重试';
}
