import type { AdminUserPage, AdminUserSummary, AuditLogPage } from '@leximochi/types';
import type { HttpClient } from '../http-client';

export interface AdminUserQuery {
  query?: string;
  status?: 'active' | 'banned';
  limit?: number;
  cursor?: string;
}

export interface AuditLogQuery {
  action?: string;
  actorUserId?: string;
  targetId?: string;
  targetType?: string;
  limit?: number;
  cursor?: string;
}

export function adminEndpoints(http: HttpClient) {
  return {
    listUsers: (query: AdminUserQuery = {}) =>
      http.request<AdminUserPage>('/admin/users', {
        query: {
          query: query.query,
          status: query.status,
          limit: query.limit,
          cursor: query.cursor,
        },
      }),

    getUser: (id: string) =>
      http.request<AdminUserSummary>(`/admin/users/${encodeURIComponent(id)}`),

    banUser: (id: string, input: { reason: string }) =>
      http.request<{ ok: boolean }>(`/admin/users/${encodeURIComponent(id)}/ban`, {
        method: 'POST',
        body: input,
      }),

    unbanUser: (id: string) =>
      http.request<{ ok: boolean }>(`/admin/users/${encodeURIComponent(id)}/unban`, {
        method: 'POST',
        body: {},
      }),

    listAuditLogs: (query: AuditLogQuery = {}) =>
      http.request<AuditLogPage>('/admin/audit-logs', {
        query: {
          action: query.action,
          actorUserId: query.actorUserId,
          targetId: query.targetId,
          targetType: query.targetType,
          limit: query.limit,
          cursor: query.cursor,
        },
      }),
  };
}
