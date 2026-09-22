import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageProvider } from '../src/storage/local-storage.provider';

describe('LocalStorageProvider', () => {
  let root: string;
  let storage: LocalStorageProvider;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'leximochi-storage-'));
    storage = new LocalStorageProvider({ rootDir: root });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('写入后可以原样读回，并报告大小', async () => {
    const data = Buffer.from('fake-audio-bytes');
    const result = await storage.put({ key: 'words/uk/a.mp3', data, contentType: 'audio/mpeg' });
    expect(result.size).toBe(data.length);
    expect(await storage.exists('words/uk/a.mp3')).toBe(true);

    const read = await storage.get('words/uk/a.mp3');
    expect(read?.data.equals(data)).toBe(true);
    expect(read?.contentType).toBe('audio/mpeg');
  });

  it('读取不存在的 key 返回 null', async () => {
    expect(await storage.get('words/uk/missing.mp3')).toBeNull();
  });

  it('删除后文件消失', async () => {
    await storage.put({
      key: 'words/uk/b.mp3',
      data: Buffer.from('x'),
      contentType: 'audio/mpeg',
    });
    await storage.delete('words/uk/b.mp3');
    expect(await storage.exists('words/uk/b.mp3')).toBe(false);
    // 重复删除不报错（幂等）
    await expect(storage.delete('words/uk/b.mp3')).resolves.toBeUndefined();
  });

  it('拒绝目录穿越的 key，且不会在根目录之外写入文件', async () => {
    for (const key of ['../escape.mp3', 'words/../../escape.mp3', '/abs/escape.mp3']) {
      await expect(
        storage.put({ key, data: Buffer.from('x'), contentType: 'audio/mpeg' }),
      ).rejects.toThrow();
    }
    expect(readdirSync(root)).toHaveLength(0);
  });

  it('拒绝读取/删除非法 key（不抛内部路径信息）', async () => {
    await expect(storage.get('../etc/passwd')).rejects.toThrow();
    await expect(storage.delete('..\\evil.mp3')).rejects.toThrow();
  });

  it('按 key 中的目录层级真实落盘', async () => {
    await storage.put({
      key: 'words/us/deep/c.mp3',
      data: Buffer.from('y'),
      contentType: 'audio/mpeg',
    });
    expect(readdirSync(join(root, 'words', 'us', 'deep'))).toEqual(['c.mp3']);
  });

  it('同一 key 重复写入会覆盖（幂等更新）', async () => {
    await storage.put({ key: 'words/uk/d.mp3', data: Buffer.from('one'), contentType: 'audio/mpeg' });
    await storage.put({ key: 'words/uk/d.mp3', data: Buffer.from('two'), contentType: 'audio/mpeg' });
    const read = await storage.get('words/uk/d.mp3');
    expect(read?.data.toString()).toBe('two');
  });
});
