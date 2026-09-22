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

export function isAdmin(permissions: string[]): boolean {
  return permissions.some((permission) => permission.startsWith('admin.'));
}

export function formatTime(timestamp: number | null): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}
