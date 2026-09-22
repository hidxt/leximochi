import type { LoginResponse, MeResponse, PublicUser } from '@leximochi/types';
import type { SessionStore } from './session-store';

export type SessionState = 'unknown' | 'authenticated' | 'anonymous';

export interface SessionClient {
  auth: {
    login(input: { username: string; password: string }): Promise<LoginResponse>;
    logout(input?: { refreshToken?: string }): Promise<unknown>;
    refresh(input?: { refreshToken?: string }): Promise<{
      accessToken: string;
      refreshToken?: string;
      expiresIn: number;
    }>;
    me(): Promise<MeResponse>;
  };
}

export interface SessionManagerOptions {
  client: SessionClient;
  store: SessionStore;
  onSessionChange?: (state: SessionState, user: PublicUser | null) => void;
  /** 复用检测是严格策略：并发刷新会让旧 token 被判定为泄漏，因此刷新必须单飞 */
  retryDelayMs?: number;
}

export interface SessionManager {
  readonly currentUser: PublicUser | null;
  readonly permissions: string[];
  login(input: { username: string; password: string }): Promise<PublicUser>;
  restore(): Promise<PublicUser | null>;
  logout(): Promise<void>;
}

export function createSessionManager(options: SessionManagerOptions): SessionManager {
  const retryDelayMs = options.retryDelayMs ?? 300;
  let currentUser: PublicUser | null = null;
  let permissions: string[] = [];
  let restorePromise: Promise<PublicUser | null> | null = null;

  function emit(state: SessionState): void {
    options.onSessionChange?.(state, currentUser);
  }

  function resetLocalState(): void {
    options.store.clear();
    currentUser = null;
    permissions = [];
  }

  /**
   * 刷新会轮换 token 并撤销上一个会话，因此「同一次会话恢复」只能发生一次：
   * 记忆化整个 restore（刷新 + 取用户信息），保证 React 严格模式的双次效应、
   * 重复挂载或并发调用都只产生一次 refresh。
   */
  async function doRestore(): Promise<PublicUser | null> {
    try {
      await refresh();
    } catch {
      // 另一个标签页可能刚轮换并写入新 Cookie，短暂等待后重试一次
      await delay(retryDelayMs);
      try {
        await refresh();
      } catch {
        resetLocalState();
        emit('anonymous');
        return null;
      }
    }

    try {
      const me = await options.client.auth.me();
      currentUser = me.user;
      permissions = me.permissions;
      emit('authenticated');
      return currentUser;
    } catch {
      resetLocalState();
      emit('anonymous');
      return null;
    }
  }

  function refresh(): Promise<void> {
    const refreshToken = options.store.getRefreshToken();
    return options.client.auth
      .refresh(refreshToken ? { refreshToken } : undefined)
      .then((refreshed) => {
        options.store.setTokens(refreshed);
      });
  }

  return {
    get currentUser(): PublicUser | null {
      return currentUser;
    },

    get permissions(): string[] {
      return permissions;
    },

    async login(input: { username: string; password: string }): Promise<PublicUser> {
      const result = await options.client.auth.login(input);
      options.store.setTokens(result);
      currentUser = result.user;
      restorePromise = Promise.resolve(result.user);
      emit('authenticated');
      return result.user;
    },

    restore(): Promise<PublicUser | null> {
      if (!restorePromise) {
        restorePromise = doRestore();
      }
      return restorePromise;
    },

    async logout(): Promise<void> {
      const refreshToken = options.store.getRefreshToken();
      try {
        await options.client.auth.logout(refreshToken ? { refreshToken } : undefined);
      } catch {
        // 服务端登出失败也要清空本地凭证，避免界面停留在已登录状态
      }
      resetLocalState();
      restorePromise = null;
      emit('anonymous');
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
