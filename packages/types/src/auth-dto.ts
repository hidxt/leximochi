export interface CaptchaChallenge {
  token: string;
  question: string;
  expiresAt: number;
}

export interface PublicUser {
  id: string;
  username: string;
  status: 'active' | 'banned';
  roles: string[];
  createdAt: number;
}

export interface RegisterResponse {
  user: PublicUser;
  recoveryCodes: string[];
}

export interface TokenPair {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}

export interface LoginResponse extends TokenPair {
  user: PublicUser;
}

export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  isCurrent: boolean;
}

export interface RecoveryResponse {
  user: PublicUser;
  recoveryCodes: string[];
}

export interface MeResponse {
  user: PublicUser;
  permissions: string[];
}

export interface AdminUserSummary {
  id: string;
  username: string;
  status: 'active' | 'banned';
  roles: string[];
  createdAt: number;
  lastLoginAt: number | null;
}

export interface AdminUserPage {
  items: AdminUserSummary[];
  nextCursor: string | null;
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorType: 'user' | 'admin' | 'system' | 'anonymous';
  action: string;
  targetType: string | null;
  targetId: string | null;
  result: 'success' | 'failure';
  createdAt: number;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  nextCursor: string | null;
}
