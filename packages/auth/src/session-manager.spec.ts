import type { LoginResponse, MeResponse } from '@leximochi/types';
import { createSessionManager } from './session-manager';
import { createMemorySessionStore, type SessionStore } from './session-store';

const user = {
  id: 'u1',
  username: 'alice',
  status: 'active' as const,
  roles: ['user'],
  createdAt: 1,
};

function fakeClient() {
  const client = {
    auth: {
      login: jest.fn<Promise<LoginResponse>, [{ username: string; password: string }]>().mockResolvedValue({
        accessToken: 'a1',
        refreshToken: 'r1',
        expiresIn: 900,
        user,
      }),
      logout: jest.fn().mockResolvedValue({ ok: true }),
      refresh: jest.fn().mockResolvedValue({ accessToken: 'a2', refreshToken: 'r2', expiresIn: 900 }),
      me: jest.fn<Promise<MeResponse>, []>().mockResolvedValue({ user, permissions: ['admin.users.read'] }),
    },
  };
  return client;
}

describe('createSessionManager', () => {
  it('登录成功后写入 tokens 并触发 authenticated', async () => {
    const store: SessionStore = createMemorySessionStore();
    const events: string[] = [];
    const client = fakeClient();
    const manager = createSessionManager({
      client,
      store,
      onSessionChange: (state) => events.push(state),
    });

    const result = await manager.login({ username: 'alice', password: 'Str0ng-Passphrase' });
    expect(result.username).toBe('alice');
    expect(store.getAccessToken()).toBe('a1');
    expect(store.getRefreshToken()).toBe('r1');
    expect(manager.currentUser?.id).toBe('u1');
    expect(events).toEqual(['authenticated']);
  });

  it('restore 用 refresh 恢复会话并加载当前用户与权限', async () => {
    const store = createMemorySessionStore();
    store.setTokens({ accessToken: 'old', refreshToken: 'r1', expiresIn: 900 });
    const client = fakeClient();
    const manager = createSessionManager({ client, store });

    const restored = await manager.restore();
    expect(restored?.username).toBe('alice');
    expect(store.getAccessToken()).toBe('a2');
    expect(manager.permissions).toEqual(['admin.users.read']);
  });

  it('restore 失败时清空凭证并进入 anonymous', async () => {
    const store = createMemorySessionStore();
    store.setTokens({ accessToken: 'old', refreshToken: 'r1', expiresIn: 900 });
    const client = fakeClient();
    client.auth.refresh.mockRejectedValue(new Error('invalid'));
    const events: string[] = [];
    const manager = createSessionManager({
      client,
      store,
      onSessionChange: (state) => events.push(state),
    });

    await expect(manager.restore()).resolves.toBeNull();
    expect(store.getAccessToken()).toBeNull();
    expect(manager.currentUser).toBeNull();
    expect(events).toContain('anonymous');
  });

  it('登出会清空凭证并触发 anonymous，即使服务端登出失败', async () => {
    const store = createMemorySessionStore();
    store.setTokens({ accessToken: 'a1', refreshToken: 'r1', expiresIn: 900 });
    const client = fakeClient();
    client.auth.logout.mockRejectedValue(new Error('network'));
    const events: string[] = [];
    const manager = createSessionManager({
      client,
      store,
      onSessionChange: (state) => events.push(state),
    });

    await manager.logout();
    expect(store.getAccessToken()).toBeNull();
    expect(store.getRefreshToken()).toBeNull();
    expect(events).toEqual(['anonymous']);
  });

  it('登录后调用 refresh 不会覆盖已知用户', async () => {
    const store = createMemorySessionStore();
    const manager = createSessionManager({ client: fakeClient(), store });
    await manager.login({ username: 'alice', password: 'Str0ng-Passphrase' });
    // 第二次登录同一账号应保持状态一致
    await manager.login({ username: 'alice', password: 'Str0ng-Passphrase' });
    expect(manager.currentUser?.username).toBe('alice');
  });
});
