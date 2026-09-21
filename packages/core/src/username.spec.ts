import { normalizeUsername, validateUsername } from './username';

describe('normalizeUsername', () => {
  it('去除首尾空白并小写', () => {
    expect(normalizeUsername('  Alice  ')).toBe('alice');
  });

  it('归一化全角字符', () => {
    expect(normalizeUsername('ｂob')).toBe('bob');
  });
});

describe('validateUsername', () => {
  it('接受合法用户名', () => {
    expect(validateUsername('alice_01')).toEqual({ ok: true });
  });

  it('拒绝过短、过长与非法字符', () => {
    expect(validateUsername('ab')).toEqual({ ok: false, reason: 'username_too_short' });
    expect(validateUsername('a'.repeat(25))).toEqual({ ok: false, reason: 'username_too_long' });
    expect(validateUsername('alice!')).toEqual({ ok: false, reason: 'username_invalid_chars' });
  });

  it('拒绝纯数字与保留名', () => {
    expect(validateUsername('123456')).toEqual({ ok: false, reason: 'username_all_digits' });
    expect(validateUsername('admin')).toEqual({ ok: false, reason: 'username_reserved' });
  });
});
