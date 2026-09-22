import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { MeResponse, PublicUser } from '@leximochi/types';
import { MochiPet } from './components/MochiPet';
import { RequireAuth } from './components/RequireAuth';
import { api, session } from './lib/api';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

type SessionState = 'unknown' | 'anonymous' | 'authenticated';

export function App(): ReactElement {
  const navigate = useNavigate();
  const [state, setState] = useState<SessionState>('unknown');
  const [me, setMe] = useState<MeResponse | null>(null);

  const loadMe = useCallback(async () => {
    const current = await api.auth.me();
    setMe(current);
  }, []);

  // 刷新页面后尝试用 refresh token（Web 端在 HttpOnly Cookie 中）恢复会话
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await session.restore();
      if (cancelled) return;
      if (user) {
        await loadMe().catch(() => undefined);
        setState('authenticated');
      } else {
        setState('anonymous');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMe]);

  const handleAuthenticated = useCallback(
    async (_user: PublicUser) => {
      await loadMe().catch(() => undefined);
      setState('authenticated');
      navigate('/', { replace: true });
    },
    [loadMe, navigate],
  );

  const handleLoggedOut = useCallback(() => {
    setMe(null);
    setState('anonymous');
    navigate('/login', { replace: true });
  }, [navigate]);

  const authenticated = state === 'authenticated';

  return (
    <main className="desk">
      <MochiPet
        mood={authenticated ? 'awake' : 'sleepy'}
        caption={
          authenticated ? (
            <>
              团子醒着，<strong>{me?.user.username ?? '学习者'}</strong>
            </>
          ) : (
            <>团子在等你回来</>
          )
        }
      />

      <div>
        {state === 'unknown' ? (
          <section className="card">
            <p className="mono">正在恢复登录状态…</p>
          </section>
        ) : (
          <Routes>
            <Route
              path="/"
              element={
                <RequireAuth authenticated={authenticated}>
                  {me ? (
                    <HomePage
                      api={api}
                      session={session}
                      me={me}
                      onLoggedOut={handleLoggedOut}
                    />
                  ) : (
                    <section className="card">
                      <p className="mono">正在读取账号信息…</p>
                    </section>
                  )}
                </RequireAuth>
              }
            />
            <Route
              path="/login"
              element={
                authenticated ? (
                  <Navigate to="/" replace />
                ) : (
                  <LoginPage api={api} session={session} onAuthenticated={(user) => void handleAuthenticated(user)} />
                )
              }
            />
            <Route
              path="/register"
              element={
                authenticated ? (
                  <Navigate to="/" replace />
                ) : (
                  <RegisterPage api={api} onRegistered={() => navigate('/login', { replace: true })} />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}

        {authenticated ? null : (
          <p className="subtitle" style={{ marginTop: 16 }}>
            还没有账号？<Link to="/register">注册并领养团子</Link>
          </p>
        )}
      </div>
    </main>
  );
}
