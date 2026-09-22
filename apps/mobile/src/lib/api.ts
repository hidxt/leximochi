import { createApiClient } from '@leximochi/api-client';
import { createSessionManager } from '@leximochi/auth';
import { createInMemorySessionStore } from './session-store';

const store = createInMemorySessionStore();

/**
 * 10.0.2.2 是 Android 模拟器访问宿主机 localhost 的固定地址；
 * 真机调试时改成局域网内的宿主机 IP。
 */
export const API_BASE_URL = 'http://10.0.2.2:3100';

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  clientType: 'mobile',
  getAccessToken: () => store.getAccessToken(),
  onUnauthorized: () => store.clear(),
});

export const session = createSessionManager({ client: api, store });
