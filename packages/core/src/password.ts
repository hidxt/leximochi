import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@leximochi/types';
import { normalizeUsername, type ValidationResult } from './username';

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  minCharacterClasses: number;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: PASSWORD_MIN_LENGTH,
  maxLength: PASSWORD_MAX_LENGTH,
  minCharacterClasses: 3,
};

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'password1234',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyuiop',
  'letmein123',
  'iloveyou123',
  'admin12345',
  'welcome123',
]);

function countCharacterClasses(value: string): number {
  let classes = 0;
  if (/[a-z]/.test(value)) classes += 1;
  if (/[A-Z]/.test(value)) classes += 1;
  if (/[0-9]/.test(value)) classes += 1;
  if (/[^A-Za-z0-9]/.test(value)) classes += 1;
  return classes;
}

export function validatePassword(
  password: string,
  ctx: { username?: string },
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): ValidationResult {
  if (password.length < policy.minLength) return { ok: false, reason: 'password_too_short' };
  if (password.length > policy.maxLength) return { ok: false, reason: 'password_too_long' };
  const lowered = password.toLowerCase();
  // 先判常见弱密码：这类密码通常也属于字符类别不足，但「过于常见」对用户更有指导意义
  if (COMMON_PASSWORDS.has(lowered)) return { ok: false, reason: 'password_too_common' };
  if (countCharacterClasses(password) < policy.minCharacterClasses) {
    return { ok: false, reason: 'password_not_complex_enough' };
  }
  if (ctx.username) {
    const canonical = normalizeUsername(ctx.username);
    if (canonical.length >= 3 && lowered.includes(canonical)) {
      return { ok: false, reason: 'password_contains_username' };
    }
  }
  return { ok: true };
}
