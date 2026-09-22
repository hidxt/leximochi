import { randomUUID } from 'node:crypto';
import {
  AUDIO_ALLOWED_EXTENSIONS,
  AUDIO_ALLOWED_MIME_TYPES,
  AUDIO_MAX_BYTES,
} from '@leximochi/types';

export type AudioMimeType = (typeof AUDIO_ALLOWED_MIME_TYPES)[number];

export interface AudioValidationSuccess {
  ok: true;
  contentType: AudioMimeType;
  extension: string;
}

export interface AudioValidationFailure {
  ok: false;
  code: 'UNSUPPORTED_MEDIA_TYPE' | 'PAYLOAD_TOO_LARGE';
  reason: string;
}

export type AudioValidationResult = AudioValidationSuccess | AudioValidationFailure;

/** 扩展名与真实 MIME 的对应关系（同时用于拒绝「扩展名与内容不一致」） */
const EXTENSION_TO_MIME: Record<string, AudioMimeType[]> = {
  '.mp3': ['audio/mpeg'],
  '.m4a': ['audio/mp4', 'audio/aac'],
  '.ogg': ['audio/ogg'],
};

/** 逐字符判断控制字符：避免使用含控制字符的正则（no-control-regex） */
function hasControlChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function startsWithAscii(data: Buffer, offset: number, text: string): boolean {
  if (data.length < offset + text.length) return false;
  return data.subarray(offset, offset + text.length).toString('latin1') === text;
}

/**
 * 按文件头（魔数）识别真实音频类型，**不信任客户端提供的 Content-Type 或扩展名**。
 */
export function detectAudioMimeType(data: Buffer): AudioMimeType | null {
  if (data.length < 4) return null;

  // ID3 标记的 MP3
  if (startsWithAscii(data, 0, 'ID3')) return 'audio/mpeg';
  // MP3 帧同步（0xFF 后跟 0xE0 掩码位）
  if (data[0] === 0xff && (data[1]! & 0xe0) === 0xe0) {
    // ADTS AAC 与 MP3 都是 0xFF 开头，用第二字节区分：0xF1/0xF9 为 ADTS
    if (data[1] === 0xf1 || data[1] === 0xf9) return 'audio/aac';
    return 'audio/mpeg';
  }
  // ISO BMFF（m4a/mp4）
  if (startsWithAscii(data, 4, 'ftyp')) return 'audio/mp4';
  // Ogg
  if (startsWithAscii(data, 0, 'OggS')) return 'audio/ogg';

  return null;
}

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

/**
 * 上传校验：大小 → 文件名安全 → 扩展名白名单 → 真实 MIME → 扩展名与内容一致。
 * 顺序固定，任一步失败都直接拒绝（不落盘）。
 */
export function validateAudioUpload(input: { filename: string; data: Buffer }): AudioValidationResult {
  const { filename, data } = input;

  if (data.length === 0) {
    return { ok: false, code: 'UNSUPPORTED_MEDIA_TYPE', reason: '文件内容为空' };
  }
  if (data.length > AUDIO_MAX_BYTES) {
    return {
      ok: false,
      code: 'PAYLOAD_TOO_LARGE',
      reason: `文件超过上限 ${Math.floor(AUDIO_MAX_BYTES / 1024 / 1024)}MB`,
    };
  }
  // 文件名本身不得包含路径分隔符、穿越片段或控制字符
  if (
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('..') ||
    hasControlChar(filename)
  ) {
    return { ok: false, code: 'UNSUPPORTED_MEDIA_TYPE', reason: '文件名不合法' };
  }

  const extension = extensionOf(filename);
  if (!(AUDIO_ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
    return {
      ok: false,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      reason: `仅支持 ${AUDIO_ALLOWED_EXTENSIONS.join('/')} 格式`,
    };
  }

  const detected = detectAudioMimeType(data);
  if (!detected) {
    return { ok: false, code: 'UNSUPPORTED_MEDIA_TYPE', reason: '文件内容不是可识别的音频' };
  }
  if (!AUDIO_ALLOWED_MIME_TYPES.includes(detected)) {
    return { ok: false, code: 'UNSUPPORTED_MEDIA_TYPE', reason: '不支持该音频编码' };
  }

  const allowedForExtension = EXTENSION_TO_MIME[extension] ?? [];
  if (!allowedForExtension.includes(detected)) {
    return {
      ok: false,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      reason: `扩展名 ${extension} 与文件内容(${detected})不一致`,
    };
  }

  return { ok: true, contentType: detected, extension };
}

/**
 * 存储 key 必须由服务端生成，且只能是规范化相对路径：
 * 不允许绝对路径、反斜杠、`..`、空段、协议前缀或控制字符。
 */
export function assertSafeStorageKey(key: string): boolean {
  if (key.length === 0 || key.length > 512) return false;
  if (hasControlChar(key)) return false;
  if (key.startsWith('/') || key.includes('\\')) return false;
  if (/^[a-zA-Z]+:/.test(key)) return false;
  const segments = key.split('/');
  if (segments.some((segment) => segment.length === 0)) return false;
  if (segments.some((segment) => segment === '.' || segment === '..')) return false;
  return true;
}

export function assertSafeStorageKeyOrThrow(key: string): void {
  if (!assertSafeStorageKey(key)) {
    // 不把非法 key 原样写进错误信息，避免日志被注入
    throw new Error('非法的存储 key');
  }
}

/** 由服务端生成 key：文件名使用随机 UUID，不采纳任何用户输入 */
export function buildAudioStorageKey(input: { prefix: string; extension: string }): string {
  if (!assertSafeStorageKey(input.prefix)) {
    throw new Error('非法的存储前缀');
  }
  const extension = input.extension.toLowerCase();
  if (!(AUDIO_ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new Error('不支持的音频扩展名');
  }
  return `${input.prefix}/${randomUUID()}${extension}`;
}
