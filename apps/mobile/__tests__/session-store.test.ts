import { createInMemorySessionStore } from '../src/lib/session-store';

describe('createInMemorySessionStore', () => {
  it('保存并读取 token', () => {
    const store = createInMemorySessionStore();
    expect(store.getAccessToken()).toBeNull();
    store.setTokens({ accessToken: 'a1', refreshToken: 'r1', expiresIn: 900 });
    expect(store.getAccessToken()).toBe('a1');
    expect(store.getRefreshToken()).toBe('r1');
  });

  it('清除后不保留任何凭证', () => {
    const store = createInMemorySessionStore();
    store.setTokens({ accessToken: 'a1', refreshToken: 'r1', expiresIn: 900 });
    store.clear();
    expect(store.getAccessToken()).toBeNull();
    expect(store.getRefreshToken()).toBeNull();
  });
});
