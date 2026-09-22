import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { ApiClient } from '@leximochi/api-client';
import type { CaptchaChallenge } from '@leximochi/types';
import { Field } from '../components/Field';
import { Notice } from '../components/Notice';

interface RegisterPageProps {
  api: ApiClient;
  onRegistered: () => void;
}

export function RegisterPage({ api, onRegistered }: RegisterPageProps): ReactElement {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    void loadCaptcha();
  }, [loadCaptcha]);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!captcha) return;
    setError(null);
    setBusy(true);
    try {
      const result = await api.auth.register({
        username,
        password,
        captchaToken: captcha.token,
        captchaAnswer,
      });
      setRecoveryCodes(result.recoveryCodes);
    } catch (caught) {
      setError(messageOf(caught));
      await loadCaptcha();
    } finally {
      setBusy(false);
    }
  }

  async function copyCodes(): Promise<void> {
    if (!recoveryCodes) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
    } catch {
      // 剪贴板不可用时用户仍可手动选择文本复制（.code 设为 user-select: all）
    }
  }

  if (recoveryCodes) {
    return (
      <section className="card">
        <span className="seal">待保存</span>
        <h1 className="title">保存这 10 个恢复码</h1>
        <p className="subtitle">
          请立即保存到安全的地方：这是它们唯一一次显示。忘记密码时，任意一个恢复码都能重置密码，
          每个只能使用一次。
        </p>
        <div className="codes">
          {recoveryCodes.map((code) => (
            <span className="code" key={code}>
              {code}
            </span>
          ))}
        </div>
        <div className="button-row">
          <button className="button button--quiet" type="button" onClick={() => void copyCodes()}>
            复制全部
          </button>
          <button
            className="button button--primary"
            type="button"
            disabled={!savedConfirmed}
            onClick={onRegistered}
          >
            我已保存，去登录
          </button>
        </div>
        <label className="field" htmlFor="saved-confirm" style={{ marginTop: 16 }}>
          <input
            id="saved-confirm"
            type="checkbox"
            checked={savedConfirmed}
            onChange={(event) => setSavedConfirmed(event.target.checked)}
          />{' '}
          我已把恢复码保存到安全的地方
        </label>
      </section>
    );
  }

  return (
    <section className="card">
      <h1 className="title">领养一只团子</h1>
      <p className="subtitle">注册只要用户名和密码，不需要邮箱或手机号。</p>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <form onSubmit={handleSubmit} noValidate>
        <Field
          id="username"
          label="用户名"
          value={username}
          onChange={setUsername}
          hint="3–24 位，可用小写字母、数字、下划线和连字符"
          autoComplete="username"
          required
        />
        <Field
          id="password"
          label="密码"
          type="password"
          value={password}
          onChange={setPassword}
          hint="至少 10 位，包含大小写字母、数字或符号中的三类"
          autoComplete="new-password"
          required
        />
        <Field
          id="captcha"
          label={`人机验证：${captcha?.question ?? '加载中…'}`}
          value={captchaAnswer}
          onChange={setCaptchaAnswer}
          required
        />
        <div className="button-row">
          <button className="button button--primary" type="submit" disabled={busy || !captcha}>
            {busy ? '创建中…' : '创建账号'}
          </button>
        </div>
      </form>
    </section>
  );
}

function messageOf(caught: unknown): string {
  if (caught && typeof caught === 'object' && 'message' in caught) {
    return String((caught as { message: unknown }).message);
  }
  return '注册失败，请稍后重试';
}
