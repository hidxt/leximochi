import { createApiClient } from '@leximochi/api-client';
import { createMemorySessionStore, createSessionManager } from '@leximochi/auth';

const store = createMemorySessionStore();

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3100',
  clientType: 'web',
  credentials: 'include',
  getAccessToken: () => store.getAccessToken(),
  onUnauthorized: () => store.clear(),
});

export const session = createSessionManager({ client: api, store });

export function getAccessToken(): string | null {
  return store.getAccessToken();
}
