import type { WordExportEntry, WordPage, WordbookVersionInfo } from '@leximochi/types';

/**
 * 词库离线读取（Phase 2 范围：下载 + 本地读取）。
 *
 * 设计：
 * - 存储通过 `OfflineStorage` 抽象注入，测试用内存实现，Android 用 AsyncStorage；
 * - 下载按 `cursor` 分页拉全量词条，写入前校验版本，`version` 变化时重新下载；
 * - 离线事件队列与冲突处理属于 Phase 7，这里只做「读」。
 */

export interface OfflineStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface OfflineWordbookMeta {
  key: string;
  name: string;
  version: number;
  wordCount: number;
  downloadedAt: number;
}

interface StoredWordbook extends OfflineWordbookMeta {
  words: WordExportEntry[];
}

/** 单次同步的最大页数：防止服务端异常导致客户端无限翻页 */
const MAX_PAGES = 200;
/** 本地保留的词库数量上限（超出时淘汰最久未下载的） */
const MAX_STORED_WORDBOOKS = 5;

const INDEX_KEY = 'leximochi.offline.wordbooks.index';
const bookKey = (key: string) => `leximochi.offline.wordbook.${key}`;

export interface WordbookApi {
  listWordbooks(): Promise<Array<{ key: string; name: string; version: number; wordCount: number }>>;
  wordbookVersion(key: string): Promise<WordbookVersionInfo>;
  exportWords(key: string, query: { cursor?: string; limit?: number }): Promise<WordPage>;
}

export interface SyncResult {
  key: string;
  downloaded: boolean;
  reason: 'up-to-date' | 'downloaded';
  wordCount: number;
  version: number;
}

export class WordbookOfflineStore {
  constructor(
    private readonly storage: OfflineStorage,
    private readonly api: WordbookApi,
  ) {}

  /** 下载或更新一个词库；服务端版本与本地一致时跳过下载 */
  async sync(key: string): Promise<SyncResult> {
    const remote = await this.api.wordbookVersion(key);
    const local = await this.read(key);
    if (local && local.version === remote.version && local.words.length === remote.wordCount) {
      return {
        key,
        downloaded: false,
        reason: 'up-to-date',
        wordCount: local.wordCount,
        version: local.version,
      };
    }

    const words: WordExportEntry[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const chunk = await this.api.exportWords(key, { cursor, limit: 200 });
      words.push(...chunk.items);
      if (!chunk.nextCursor) break;
      cursor = chunk.nextCursor;
    }

    const books = await this.api.listWordbooks();
    const meta = books.find((book) => book.key === key);
    const stored: StoredWordbook = {
      key,
      name: meta?.name ?? key,
      version: remote.version,
      wordCount: words.length,
      downloadedAt: Date.now(),
      words,
    };
    await this.storage.setItem(bookKey(key), JSON.stringify(stored));
    await this.touchIndex(key);
    await this.evictIfNeeded();

    return {
      key,
      downloaded: true,
      reason: 'downloaded',
      wordCount: stored.wordCount,
      version: stored.version,
    };
  }

  /** 已下载词库的元信息（不含词条内容，用于列表展示） */
  async listDownloaded(): Promise<OfflineWordbookMeta[]> {
    const index = await this.readIndex();
    const result: OfflineWordbookMeta[] = [];
    for (const key of index) {
      const book = await this.read(key);
      if (!book) continue;
      result.push({
        key: book.key,
        name: book.name,
        version: book.version,
        wordCount: book.wordCount,
        downloadedAt: book.downloadedAt,
      });
    }
    return result;
  }

  /** 离线读取某个词库的全部词条（未下载时返回空数组，不报错） */
  async readWords(key: string): Promise<WordExportEntry[]> {
    const book = await this.read(key);
    return book?.words ?? [];
  }

  /** 离线按词形搜索（大小写不敏感，前缀优先） */
  async search(key: string, query: string, limit = 20): Promise<WordExportEntry[]> {
    const words = await this.readWords(key);
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return [];
    const prefix: WordExportEntry[] = [];
    const contains: WordExportEntry[] = [];
    for (const word of words) {
      const headword = word.headword.toLowerCase();
      if (headword.startsWith(needle)) prefix.push(word);
      else if (headword.includes(needle)) contains.push(word);
      if (prefix.length >= limit) break;
    }
    return [...prefix, ...contains].slice(0, limit);
  }

  /** 离线按 id 取词条（学习记录里保存的 wordId 可直接命中） */
  async findById(key: string, wordId: string): Promise<WordExportEntry | null> {
    const words = await this.readWords(key);
    return words.find((word) => word.id === wordId) ?? null;
  }

  async remove(key: string): Promise<void> {
    await this.storage.removeItem(bookKey(key));
    const index = (await this.readIndex()).filter((item) => item !== key);
    await this.storage.setItem(INDEX_KEY, JSON.stringify(index));
  }

  private async read(key: string): Promise<StoredWordbook | null> {
    const raw = await this.storage.getItem(bookKey(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredWordbook;
    } catch {
      // 本地数据损坏时按未下载处理，下次同步会重写
      return null;
    }
  }

  private async readIndex(): Promise<string[]> {
    const raw = await this.storage.getItem(INDEX_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private async touchIndex(key: string): Promise<void> {
    const index = (await this.readIndex()).filter((item) => item !== key);
    index.unshift(key);
    await this.storage.setItem(INDEX_KEY, JSON.stringify(index));
  }

  private async evictIfNeeded(): Promise<void> {
    const index = await this.readIndex();
    const stale = index.slice(MAX_STORED_WORDBOOKS);
    for (const key of stale) {
      await this.remove(key);
    }
  }
}

/** 内存实现：单元测试与临时场景使用 */
export function createMemoryOfflineStorage(seed: Record<string, string> = {}): OfflineStorage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key) => Promise.resolve(map.get(key) ?? null),
    setItem: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
  };
}
