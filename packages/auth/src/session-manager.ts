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
}

export interface SessionManager {
  readonly currentUser: PublicUser | null;
  readonly permissions: string[];
  login(input: { username: string; password: string }): Promise<PublicUser>;
  restore(): Promise<PublicUser | null>;
  logout(): Promise<void>;
}

export function createSessionManager(options: SessionManagerOptions): SessionManager {
  let currentUser: PublicUser | null = null;
  let permissions: string[] = [];

  function emit(state: SessionState): void {
    options.onSessionChange?.(state, currentUser);
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
      emit('authenticated');
      return result.user;
    },

    async restore(): Promise<PublicUser | null> {
      const refreshToken = options.store.getRefreshToken();
      try {
        const refreshed = await options.client.auth.refresh(
          refreshToken ? { refreshToken } : undefined,
        );
        options.store.setTokens(refreshed);
        const me = await options.client.auth.me();
        currentUser = me.user;
        permissions = me.permissions;
        emit('authenticated');
        return currentUser;
      } catch {
        options.store.clear();
        currentUser = null;
        permissions = [];
        emit('anonymous');
        return null;
      }
    },

    async logout(): Promise<void> {
      const refreshToken = options.store.getRefreshToken();
      try {
        await options.client.auth.logout(refreshToken ? { refreshToken } : undefined);
      } catch {
        // 服务端登出失败也要清空本地凭证，避免界面停留在已登录状态
      }
      options.store.clear();
      currentUser = null;
      permissions = [];
      emit('anonymous');
    },
  };
}
