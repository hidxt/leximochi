import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { MeResponse } from '@leximochi/types';
import { api, isAdmin, session } from './lib/api';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminWordsPage } from './pages/AdminWordsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { UsersPage } from './pages/UsersPage';
import { WordbooksPage } from './pages/WordbooksPage';

type State = 'unknown' | 'anonymous' | 'authenticated';

export function App(): ReactElement {
  const navigate = useNavigate();
  const [state, setState] = useState<State>('unknown');
  const [me, setMe] = useState<MeResponse | null>(null);

  const loadMe = useCallback(async (): Promise<MeResponse> => {
    const current = await api.auth.me();
    setMe(current);
    return current;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await session.restore();
      if (cancelled) return;
      if (!user) {
        setState('anonymous');
        return;
      }
      try {
        const current = await loadMe();
        if (cancelled) return;
        if (!isAdmin(current.permissions)) {
          await session.logout();
          if (!cancelled) setState('anonymous');
          return;
        }
        setState('authenticated');
      } catch {
        if (!cancelled) setState('anonymous');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMe]);

  const signedOut = useCallback(() => {
    setMe(null);
    setState('anonymous');
    navigate('/login', { replace: true });
  }, [navigate]);

  if (state === 'unknown') {
    return <p className="empty" style={{ padding: 24 }}>正在校验后台权限…</p>;
  }

  if (state === 'anonymous') {
    return (
      <Routes>
        <Route
          path="/login"
          element={
            <AdminLoginPage
              api={api}
              session={session}
              onSignedIn={() => {
                void loadMe().catch(() => undefined);
                setState('authenticated');
                navigate('/users', { replace: true });
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <header className="topbar">
        <div style={{ display: 'flex', gap: 18, alignItems: 'baseline' }}>
          <h1 className="topbar__title">词团子 · 管理后台</h1>
          <nav style={{ display: 'flex', gap: 12 }}>
            <NavLink to="/users">用户</NavLink>
            <NavLink to="/wordbooks">词库</NavLink>
            <NavLink to="/words">词条</NavLink>
            <NavLink to="/audit">审计日志</NavLink>
          </nav>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="topbar__meta">{me?.user.username}</span>
          <button className="button button--quiet" type="button" onClick={() => void session.logout().then(signedOut)}>
            退出
          </button>
        </div>
      </header>

      <Routes>
        <Route path="/users" element={<UsersPage api={api} />} />
        <Route path="/wordbooks" element={<WordbooksPage api={api} />} />
        <Route path="/words" element={<AdminWordsPage api={api} />} />
        <Route path="/audit" element={<AuditLogsPage api={api} />} />
        <Route path="*" element={<Navigate to="/users" replace />} />
      </Routes>
    </>
  );
}
