export const SESSION_REPOSITORY = 'SESSION_REPOSITORY';

export interface SessionRecord {
  id: string;
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: number;
  revokedAt: number | null;
  revokedReason: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface CreateSessionInput {
  id: string;
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: number;
  userAgent: string | null;
  ip: string | null;
  now: number;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<void>;
  findById(id: string): Promise<SessionRecord | null>;
  findByRefreshHash(hash: string): Promise<SessionRecord | null>;
  touch(sessionId: string, now: number): Promise<void>;
  /** 条件撤销：仅当未撤销时生效，返回是否成功 */
  revoke(sessionId: string, reason: string, now: number): Promise<boolean>;
  revokeFamily(familyId: string, reason: string, now: number): Promise<void>;
  revokeAllForUser(userId: string, reason: string, now: number): Promise<void>;
  listActive(userId: string): Promise<SessionRecord[]>;
}
