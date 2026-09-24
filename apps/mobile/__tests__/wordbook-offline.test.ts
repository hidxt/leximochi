import { createMemoryOfflineStorage, WordbookOfflineStore, type WordbookApi } from '../src/lib/wordbook-offline';
import type { WordExportEntry, WordPage } from '@leximochi/types';

function word(id: string, headword: string): WordExportEntry {
  return {
    id,
    headword,
    phoneticUk: null,
    phoneticUs: null,
    audioUkKey: null,
    audioUsKey: null,
    rank: null,
    tags: [],
    senses: [{ id: `s-${id}`, partOfSpeech: 'v.', definitionZh: `${headword} 的释义`, definitionEn: null, examMeaning: null }],
    examples: [],
    phrases: [],
    forms: [],
    relations: [],
  };
}

/** 用固定数据集模拟服务端分页导出 */
function fakeApi(options: {
  words: WordExportEntry[];
  version?: number;
  pageSize?: number;
  versionCalls?: { count: number };
}): WordbookApi {
  const version = options.version ?? 1;
  const pageSize = options.pageSize ?? 2;
  return {
    listWordbooks: () =>
      Promise.resolve([
        { key: 'cet4', name: '四级核心词', version, wordCount: options.words.length },
      ]),
    wordbookVersion: (key) => {
      if (options.versionCalls) options.versionCalls.count += 1;
      return Promise.resolve({
        key,
        version,
        wordCount: options.words.length,
        updatedAt: Date.now(),
      });
    },
    exportWords: (_key, query): Promise<WordPage> => {
      const start = query.cursor ? Number(query.cursor) : 0;
      const slice = options.words.slice(start, start + pageSize);
      const next = start + pageSize < options.words.length ? String(start + pageSize) : null;
      return Promise.resolve({ items: slice, nextCursor: next });
    },
  };
}

describe('词库离线下载与读取', () => {
  it('按游标分页拉取全量词条并写入本地存储', async () => {
    const storage = createMemoryOfflineStorage();
    const words = [word('w1', 'abandon'), word('w2', 'brief'), word('w3', 'cancel'), word('w4', 'deport')];
    const store = new WordbookOfflineStore(storage, fakeApi({ words, pageSize: 2 }));

    const result = await store.sync('cet4');
    expect(result).toMatchObject({ downloaded: true, reason: 'downloaded', wordCount: 4, version: 1 });

    const offline = await store.readWords('cet4');
    expect(offline.map((item) => item.headword)).toEqual(['abandon', 'brief', 'cancel', 'deport']);
    expect(offline[0]!.senses[0]!.definitionZh).toBe('abandon 的释义');
  });

  it('版本与词数一致时跳过重复下载', async () => {
    const storage = createMemoryOfflineStorage();
    const versionCalls = { count: 0 };
    const store = new WordbookOfflineStore(
      storage,
      fakeApi({ words: [word('w1', 'abandon')], versionCalls }),
    );

    await store.sync('cet4');
    const second = await store.sync('cet4');
    expect(second).toMatchObject({ downloaded: false, reason: 'up-to-date' });
    expect(versionCalls.count).toBe(2);
  });

  it('服务端版本变化后重新下载', async () => {
    const storage = createMemoryOfflineStorage();
    const words = [word('w1', 'abandon')];
    await new WordbookOfflineStore(storage, fakeApi({ words, version: 1 })).sync('cet4');

    const updated = await new WordbookOfflineStore(
      storage,
      fakeApi({ words: [word('w1', 'abandon'), word('w2', 'brief')], version: 2 }),
    ).sync('cet4');

    expect(updated).toMatchObject({ downloaded: true, version: 2, wordCount: 2 });
  });

  it('离线搜索：前缀优先，大小写不敏感', async () => {
    const storage = createMemoryOfflineStorage();
    const store = new WordbookOfflineStore(
      storage,
      fakeApi({ words: [word('w1', 'abandon'), word('w2', 'band'), word('w3', 'abruptly')] }),
    );
    await store.sync('cet4');

    const byPrefix = await store.search('cet4', 'ab');
    expect(byPrefix.map((item) => item.headword)).toEqual(['abandon', 'abruptly']);

    // 前缀命中排在前，包含命中排在后（'abandon' 内含 'band'）
    expect((await store.search('cet4', 'BAND')).map((item) => item.headword)).toEqual(['band', 'abandon']);
    expect(await store.search('cet4', '  ')).toEqual([]);
  });

  it('按 wordId 离线取词条，未下载时返回空而不报错', async () => {
    const storage = createMemoryOfflineStorage();
    const store = new WordbookOfflineStore(storage, fakeApi({ words: [word('w1', 'abandon')] }));

    expect(await store.findById('cet4', 'w1')).toBeNull();
    await store.sync('cet4');
    expect((await store.findById('cet4', 'w1'))?.headword).toBe('abandon');
    expect(await store.findById('cet4', 'missing')).toBeNull();
  });

  it('删除后本地不再保留该词库', async () => {
    const storage = createMemoryOfflineStorage();
    const store = new WordbookOfflineStore(storage, fakeApi({ words: [word('w1', 'abandon')] }));
    await store.sync('cet4');
    expect(await store.listDownloaded()).toHaveLength(1);

    await store.remove('cet4');
    expect(await store.listDownloaded()).toHaveLength(0);
    expect(await store.readWords('cet4')).toEqual([]);
  });

  it('本地数据损坏时按未下载处理并可重新同步', async () => {
    const storage = createMemoryOfflineStorage({
      'leximochi.offline.wordbook.cet4': '{ 不是合法 JSON',
      'leximochi.offline.wordbooks.index': JSON.stringify(['cet4']),
    });
    const store = new WordbookOfflineStore(storage, fakeApi({ words: [word('w1', 'abandon')] }));

    expect(await store.readWords('cet4')).toEqual([]);
    const result = await store.sync('cet4');
    expect(result.downloaded).toBe(true);
    expect(await store.readWords('cet4')).toHaveLength(1);
  });
});
