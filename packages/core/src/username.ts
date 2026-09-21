import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@leximochi/types';

export type ValidationResult = { ok: true } | { ok: false; reason: string };

const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'support',
  'official',
  'leximochi',
  'moderator',
]);

const ALLOWED_PATTERN = /^[a-z0-9_-]+$/;

export function normalizeUsername(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase();
}

export function validateUsername(raw: string): ValidationResult {
  const value = normalizeUsername(raw);
  if (value.length < USERNAME_MIN_LENGTH) return { ok: false, reason: 'username_too_short' };
  if (value.length > USERNAME_MAX_LENGTH) return { ok: false, reason: 'username_too_long' };
  if (!ALLOWED_PATTERN.test(value)) return { ok: false, reason: 'username_invalid_chars' };
  if (/^[0-9]+$/.test(value)) return { ok: false, reason: 'username_all_digits' };
  if (RESERVED_USERNAMES.has(value)) return { ok: false, reason: 'username_reserved' };
  return { ok: true };
}
