import { useState, type ReactElement } from 'react';
import type { ApiClient } from '@leximochi/api-client';
import type { SessionManager } from '@leximochi/auth';
import { isAdmin } from '../lib/api';

interface AdminLoginPageProps {
  api: ApiClient;
  session: SessionManager;
  onSignedIn: () => void;
}

export function AdminLoginPage({ api, session, onSignedIn }: AdminLoginPageProps): ReactElement {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await session.login({ username, password });
      const me = await api.auth.me();
      if (!isAdmin(me.permissions)) {
        // 前端仅做体验优化：真正的权限判定在服务端（非管理员访问 /admin/* 一律 403）
        await session.logout();
        setError('该账号没有后台权限');
        return;
      }
      onSignedIn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '登录失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="login">
      <h1 className="page__title">管理后台</h1>
      <p className="page__note">仅限管理员账号登录，所有操作都会被记录。</p>

      {error ? (
        <p className="notice notice--error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} noValidate>
        <div className="field" style={{ marginTop: 12 }}>
          <label className="field__label" htmlFor="admin-username">
            用户名
          </label>
          <input
            id="admin-username"
            type="text"
            value={username}
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label className="field__label" htmlFor="admin-password">
            密码
          </label>
          <input
            id="admin-password"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <button className="button" type="submit" disabled={busy} style={{ marginTop: 16 }}>
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
    </section>
  );
}
