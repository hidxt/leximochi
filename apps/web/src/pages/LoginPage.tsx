import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { ApiClient } from '@leximochi/api-client';
import type { SessionManager } from '@leximochi/auth';
import type { CaptchaChallenge, PublicUser } from '@leximochi/types';
import { Field } from '../components/Field';
import { Notice } from '../components/Notice';

interface LoginPageProps {
  api: ApiClient;
  session: SessionManager;
  onAuthenticated: (user: PublicUser) => void;
}

type Mode = 'login' | 'recovery';

export function LoginPage({ api, session, onAuthenticated }: LoginPageProps): ReactElement {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCaptcha = useCallback(async () => {
    try {
      const challenge = await api.auth.issueCaptcha();
      setCaptcha(challenge);
      setCaptchaAnswer('');
    } catch {
      setError('无法获取人机验证题，请稍后重试');
    }
  }, [api]);

  useEffect(() => {
    if (mode === 'recovery') {
      void loadCaptcha();
    }
  }, [mode, loadCaptcha]);

  async function handleLogin(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await session.login({ username, password });
      onAuthenticated(user);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleRecovery(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!captcha) return;
    setError(null);
    setBusy(true);
    try {
      const result = await api.auth.recover({
        username,
        recoveryCode,
        newPassword,
        captchaToken: captcha.token,
        captchaAnswer,
      });
      setNotice(
        `密码已重置。这是新的恢复码，请立即保存（旧恢复码已全部作废）：${result.recoveryCodes.join('  ')}`,
      );
      setMode('login');
      setPassword('');
      setRecoveryCode('');
      setNewPassword('');
    } catch (caught) {
      setError(messageOf(caught));
      await loadCaptcha();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h1 className="title">{mode === 'login' ? '回到书桌' : '用恢复码找回账号'}</h1>
      <p className="subtitle">
        {mode === 'login'
          ? '登录后团子会醒过来，记录你的每日学习。'
          : '输入注册时保存的一次性恢复码，重置密码后所有设备都会退出登录。'}
      </p>

      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {mode === 'login' ? (
        <form onSubmit={handleLogin} noValidate>
          <Field
            id="username"
            label="用户名"
            value={username}
            onChange={setUsername}
            autoComplete="username"
            required
          />
          <Field
            id="password"
            label="密码"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
          />
          <div className="button-row">
            <button className="button button--primary" type="submit" disabled={busy}>
              {busy ? '登录中…' : '登录'}
            </button>
            <button
              className="button button--quiet"
              type="button"
              onClick={() => {
                setMode('recovery');
                setError(null);
              }}
            >
              忘记密码
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleRecovery} noValidate>
          <Field
            id="recovery-username"
            label="用户名"
            value={username}
            onChange={setUsername}
            autoComplete="username"
            required
          />
          <Field
            id="recovery-code"
            label="恢复码"
            value={recoveryCode}
            onChange={setRecoveryCode}
            hint="形如 ABCD-EFGH-JKMN，大小写与连字符不影响识别"
            required
          />
          <Field
            id="new-password"
            label="新密码"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            hint="至少 10 位，包含大小写字母、数字或符号中的三类"
            required
          />
          <Field
            id="recovery-captcha"
            label={`人机验证：${captcha?.question ?? '加载中…'}`}
            value={captchaAnswer}
            onChange={setCaptchaAnswer}
            required
          />
          <div className="button-row">
            <button
              className="button button--primary"
              type="submit"
              disabled={busy || !captcha}
            >
              {busy ? '重置中…' : '重置密码'}
            </button>
            <button
              className="button button--quiet"
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
            >
              返回登录
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function messageOf(caught: unknown): string {
  if (caught && typeof caught === 'object' && 'message' in caught) {
    return String((caught as { message: unknown }).message);
  }
  return '操作失败，请稍后重试';
}
