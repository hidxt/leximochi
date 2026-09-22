import { adminEndpoints } from './endpoints/admin.endpoints';
import { authEndpoints } from './endpoints/auth.endpoints';
import { HttpClient, type HttpClientOptions } from './http-client';

export * from './api-error';
export * from './http-client';
export type { AdminUserQuery, AuditLogQuery } from './endpoints/admin.endpoints';
export type { RefreshResult } from './endpoints/auth.endpoints';

export function createApiClient(options: HttpClientOptions) {
  const http = new HttpClient(options);
  return {
    health: () => http.request<{ status: string; uptimeSeconds: number }>('/health', { anonymous: true }),
    auth: authEndpoints(http),
    admin: adminEndpoints(http),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
