import type { SessionStore } from '@leximochi/auth';

/**
 * Phase 1 使用内存存储（App 重启后需重新登录）。
 * Phase 7 接入 Android Keystore 支持的持久化存储，并配合离线同步使用。
 */
export function createInMemorySessionStore(): SessionStore {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  return {
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
    setTokens: (tokens) => {
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken ?? refreshToken;
    },
    clear: () => {
      accessToken = null;
      refreshToken = null;
    },
  };
}
