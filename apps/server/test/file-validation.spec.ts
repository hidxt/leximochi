import { AUDIO_MAX_BYTES } from '@leximochi/types';
import {
  assertSafeStorageKey,
  buildAudioStorageKey,
  detectAudioMimeType,
  validateAudioUpload,
} from '../src/storage/file-validation';

function mp3(): Buffer {
  return Buffer.concat([Buffer.from('ID3'), Buffer.alloc(600, 0)]);
}

function m4a(): Buffer {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x20]),
    Buffer.from('ftypM4A '),
    Buffer.alloc(600, 0),
  ]);
}

function ogg(): Buffer {
  return Buffer.concat([Buffer.from('OggS'), Buffer.alloc(600, 0)]);
}

function aac(): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xf1, 0x50, 0x80]), Buffer.alloc(600, 0)]);
}

describe('detectAudioMimeType（按文件头识别真实类型）', () => {
  it('识别 mp3 / m4a / ogg / aac', () => {
    expect(detectAudioMimeType(mp3())).toBe('audio/mpeg');
    expect(detectAudioMimeType(m4a())).toBe('audio/mp4');
    expect(detectAudioMimeType(ogg())).toBe('audio/ogg');
    expect(detectAudioMimeType(aac())).toBe('audio/aac');
  });

  it('纯文本内容不识别为音频', () => {
    expect(detectAudioMimeType(Buffer.from('this is definitely not audio'))).toBeNull();
  });

  it('太短的数据不识别', () => {
    expect(detectAudioMimeType(Buffer.from([0x49]))).toBeNull();
  });
});

describe('validateAudioUpload', () => {
  it('接受合法 mp3', () => {
    expect(
      validateAudioUpload({ filename: 'hello.mp3', data: mp3() }),
    ).toEqual({ ok: true, contentType: 'audio/mpeg', extension: '.mp3' });
  });

  it('扩展名不在白名单时拒绝', () => {
    const result = validateAudioUpload({ filename: 'hello.txt', data: mp3() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('伪造扩展名（.mp3 实为文本）被拒绝', () => {
    const result = validateAudioUpload({
      filename: 'fake.mp3',
      data: Buffer.from('not audio at all, just text'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect(result.reason).toMatch(/文件内容/);
    }
  });

  it('扩展名与真实类型不一致时拒绝（.ogg 实为 mp3）', () => {
    const result = validateAudioUpload({ filename: 'mismatch.ogg', data: mp3() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/不一致/);
  });

  it('超过大小上限时拒绝', () => {
    const big = Buffer.concat([mp3(), Buffer.alloc(AUDIO_MAX_BYTES, 0)]);
    const result = validateAudioUpload({ filename: 'big.mp3', data: big });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('空文件被拒绝', () => {
    const result = validateAudioUpload({ filename: 'empty.mp3', data: Buffer.alloc(0) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('文件名含路径分隔符或穿越片段时拒绝', () => {
    for (const filename of ['../evil.mp3', 'dir/evil.mp3', '..\\evil.mp3', 'evil\0.mp3']) {
      const result = validateAudioUpload({ filename, data: mp3() });
      expect(result.ok).toBe(false);
    }
  });
});

describe('buildAudioStorageKey', () => {
  it('生成不含用户输入的随机 key，并按前缀分目录', () => {
    const key = buildAudioStorageKey({ prefix: 'words/uk', extension: '.mp3' });
    expect(key).toMatch(/^words\/uk\/[0-9a-f-]{36}\.mp3$/);
    expect(assertSafeStorageKey(key)).toBe(true);
  });

  it('不同调用产生不同 key', () => {
    const a = buildAudioStorageKey({ prefix: 'words/uk', extension: '.mp3' });
    const b = buildAudioStorageKey({ prefix: 'words/uk', extension: '.mp3' });
    expect(a).not.toBe(b);
  });

  it('拒绝非法前缀与扩展名', () => {
    expect(() => buildAudioStorageKey({ prefix: '../etc', extension: '.mp3' })).toThrow();
    expect(() => buildAudioStorageKey({ prefix: 'words/uk', extension: '.exe' })).toThrow();
  });
});

describe('assertSafeStorageKey', () => {
  it('接受相对且规范化的 key', () => {
    expect(assertSafeStorageKey('words/uk/abc.mp3')).toBe(true);
  });

  it('拒绝穿越、绝对路径、反斜杠与控制字符', () => {
    for (const key of [
      '../evil.mp3',
      'words/../../evil.mp3',
      '/etc/passwd',
      'C:\\Windows\\evil.mp3',
      'words\\uk\\abc.mp3',
      'words/uk/ab\0c.mp3',
      '',
      'words//uk/abc.mp3',
    ]) {
      expect(assertSafeStorageKey(key)).toBe(false);
    }
  });
});
