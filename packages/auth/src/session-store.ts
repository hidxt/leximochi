export interface TokenBundle {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface SessionStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(tokens: TokenBundle): void;
  clear(): void;
}

/**
 * 内存实现，仅用于 Web/Admin（refresh token 由 HttpOnly Cookie 承载）与测试。
 * Android 端在后续阶段提供系统安全存储实现。
 */
export function createMemorySessionStore(): SessionStore {
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
