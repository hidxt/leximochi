import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export type DrizzleDb = BetterSQLite3Database<typeof schema>;

export const BUSY_TIMEOUT_MS = 5000;

export interface DatabaseService {
  readonly sqlite: BetterSqlite3.Database;
  readonly db: DrizzleDb;
  pragma(name: string): unknown;
  withTransaction<T>(fn: (tx: DrizzleDb) => T): T;
  close(): void;
}

/**
 * better-sqlite3 13 起 pragma() 返回行数组（如 [{ journal_mode: 'wal' }]，
 * busy_timeout 的键名为 timeout），这里归一化为单个标量。
 */
function readPragma(sqlite: BetterSqlite3.Database, statement: string): unknown {
  const result = sqlite.pragma(statement) as unknown;
  if (!Array.isArray(result) || result.length === 0) return undefined;
  const first = result[0] as Record<string, unknown>;
  const keys = Object.keys(first);
  return keys.length === 1 ? first[keys[0]!] : first;
}

export function createDatabase(databasePath: string): DatabaseService {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  const sqlite = new BetterSqlite3(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');

  // 启动即断言关键 PRAGMA 真的生效，避免静默降级
  const isMemory = databasePath === ':memory:';
  const journalMode = String(readPragma(sqlite, 'journal_mode')).toLowerCase();
  if (!isMemory && journalMode !== 'wal') {
    sqlite.close();
    throw new Error(`SQLite 未能启用 WAL（当前模式: ${journalMode}）`);
  }
  if (Number(readPragma(sqlite, 'busy_timeout')) !== BUSY_TIMEOUT_MS) {
    sqlite.close();
    throw new Error('SQLite busy_timeout 未生效');
  }
  if (Number(readPragma(sqlite, 'foreign_keys')) !== 1) {
    sqlite.close();
    throw new Error('SQLite 外键约束未生效');
  }

  const db = drizzle(sqlite, { schema });
  return {
    sqlite,
    db,
    pragma: (name: string) => readPragma(sqlite, name),
    withTransaction: <T>(fn: (tx: DrizzleDb) => T): T => sqlite.transaction(() => fn(db))(),
    close: () => sqlite.close(),
  };
}

export { schema };
