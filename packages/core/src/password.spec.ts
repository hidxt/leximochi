import { validatePassword } from './password';

describe('validatePassword', () => {
  it('接受满足策略的密码', () => {
    expect(validatePassword('Str0ng-Passphrase', { username: 'alice' })).toEqual({ ok: true });
  });

  it('拒绝过短与超长密码', () => {
    expect(validatePassword('Short1-a', {})).toEqual({ ok: false, reason: 'password_too_short' });
    expect(validatePassword('a1-'.repeat(60), {})).toEqual({ ok: false, reason: 'password_too_long' });
  });

  it('拒绝字符类别不足的密码', () => {
    expect(validatePassword('aaaaaaaaaaaa', {})).toEqual({
      ok: false,
      reason: 'password_not_complex_enough',
    });
  });

  it('拒绝常见弱密码', () => {
    expect(validatePassword('password1234', {})).toEqual({ ok: false, reason: 'password_too_common' });
  });

  it('拒绝包含用户名的密码', () => {
    expect(validatePassword('Alice-Str0ng', { username: 'alice' })).toEqual({
      ok: false,
      reason: 'password_contains_username',
    });
  });
});
