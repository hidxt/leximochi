import type { AuditLogPage } from '@leximochi/types';

export const AUDIT_REPOSITORY = 'AUDIT_REPOSITORY';

export interface AuditRecordInput {
  actorUserId: string | null;
  actorType: 'user' | 'admin' | 'system' | 'anonymous';
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  result: 'success' | 'failure';
  metadata?: Record<string, string | number | boolean | null>;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditQuery {
  action?: string;
  actorUserId?: string;
  targetId?: string;
  targetType?: string;
  limit: number;
  cursor?: string;
}

export interface AuditRepository {
  insert(input: AuditRecordInput & { id: string; createdAt: number }): Promise<void>;
  list(query: AuditQuery): Promise<AuditLogPage>;
}
