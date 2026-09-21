import { generateRecoveryCodes, normalizeRecoveryCode } from './recovery-code';

const fixedRandom = (size: number): Uint8Array => new Uint8Array(size).fill(7);

describe('generateRecoveryCodes', () => {
  it('按数量生成分组格式的码，且不含易混字符', () => {
    const codes = generateRecoveryCodes({ count: 10, randomBytes: fixedRandom });
    expect(codes).toHaveLength(10);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(code).not.toMatch(/[ILOU]/);
    }
  });

  it('不同随机源产生不同结果', () => {
    let counter = 0;
    const randomBytes = (size: number): Uint8Array => {
      counter += 1;
      return new Uint8Array(size).fill(counter);
    };
    const codes = generateRecoveryCodes({ count: 2, randomBytes });
    expect(codes[0]).not.toBe(codes[1]);
  });

  it('随机源字节数不足时抛错', () => {
    expect(() => generateRecoveryCodes({ count: 1, randomBytes: () => new Uint8Array(1) })).toThrow();
  });
});

describe('normalizeRecoveryCode', () => {
  it('忽略大小写、空格与连字符', () => {
    expect(normalizeRecoveryCode(' abcd-efgh jkmn ')).toBe('ABCDEFGHJKMN');
  });

  it('映射易混字符', () => {
    expect(normalizeRecoveryCode('OOOO-IIII')).toBe('00001111');
  });
});
