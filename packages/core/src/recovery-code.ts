import { RECOVERY_CODE_GROUP_COUNT, RECOVERY_CODE_GROUP_LENGTH } from '@leximochi/types';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = RECOVERY_CODE_GROUP_COUNT * RECOVERY_CODE_GROUP_LENGTH;

export function generateRecoveryCodes(options: {
  count: number;
  randomBytes: (size: number) => Uint8Array;
}): string[] {
  const codes: string[] = [];
  for (let i = 0; i < options.count; i += 1) {
    const bytes = options.randomBytes(CODE_LENGTH);
    if (bytes.length < CODE_LENGTH) {
      throw new Error('随机源返回的字节数不足');
    }
    let chars = '';
    for (let j = 0; j < CODE_LENGTH; j += 1) {
      chars += ALPHABET[bytes[j]! % ALPHABET.length];
    }
    const groups: string[] = [];
    for (let g = 0; g < RECOVERY_CODE_GROUP_COUNT; g += 1) {
      groups.push(
        chars.slice(g * RECOVERY_CODE_GROUP_LENGTH, (g + 1) * RECOVERY_CODE_GROUP_LENGTH),
      );
    }
    codes.push(groups.join('-'));
  }
  return codes;
}

export function normalizeRecoveryCode(raw: string): string {
  return raw
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}
