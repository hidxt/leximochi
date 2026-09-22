import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { assertSafeStorageKeyOrThrow } from './file-validation';

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface StoragePutInput {
  /** 相对 key，由服务端生成（见 buildAudioStorageKey） */
  key: string;
  data: Buffer;
  contentType: string;
}

export interface StorageObject {
  key: string;
  size: number;
  contentType: string;
}

export interface StorageProvider {
  put(input: StoragePutInput): Promise<StorageObject>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
};

/**
 * 本地文件存储实现（未来可替换为 S3 兼容实现而不改业务代码）。
 * 安全要点：
 * - key 必须是规范化相对路径；写入前解析为绝对路径并断言仍在存储根目录内（防目录穿越）
 * - 业务代码不得拼接绝对路径，一切经由本 Provider
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly rootDir: string;

  constructor(options: { rootDir: string }) {
    this.rootDir = resolve(options.rootDir);
  }

  async put(input: StoragePutInput): Promise<StorageObject> {
    const absolutePath = this.resolveWithinRoot(input.key);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.data);
    return { key: input.key, size: input.data.length, contentType: input.contentType };
  }

  async get(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    const absolutePath = this.resolveWithinRoot(key);
    if (!existsSync(absolutePath)) return null;
    const data = await readFile(absolutePath);
    return { data, contentType: this.contentTypeOf(key) };
  }

  async delete(key: string): Promise<void> {
    const absolutePath = this.resolveWithinRoot(key);
    await rm(absolutePath, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.resolveWithinRoot(key));
  }

  private resolveWithinRoot(key: string): string {
    assertSafeStorageKeyOrThrow(key);
    const absolutePath = resolve(this.rootDir, key);
    // 路径穿越的最后一道防线：解析后的路径必须仍在存储根目录内
    if (absolutePath !== this.rootDir && !absolutePath.startsWith(this.rootDir + sep)) {
      throw new Error('非法的存储 key');
    }
    return absolutePath;
  }

  private contentTypeOf(key: string): string {
    const dot = key.lastIndexOf('.');
    const extension = dot === -1 ? '' : key.slice(dot).toLowerCase();
    return CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream';
  }
}

export function uploadsRootDir(dataDir: string): string {
  return join(dataDir, 'uploads');
}
