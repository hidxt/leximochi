import type { AttemptKind } from '../../../database/schema/auth-attempts';

export const AUTH_ATTEMPT_REPOSITORY = 'AUTH_ATTEMPT_REPOSITORY';

export interface RecordAttemptInput {
  id: string;
  kind: AttemptKind;
  usernameCanonical: string | null;
  ip: string | null;
  success: boolean;
  createdAt: number;
}

export interface CountFailuresInput {
  kind: AttemptKind;
  usernameCanonical?: string | null;
  ip?: string | null;
  since: number;
}

export interface AuthAttemptRepository {
  record(input: RecordAttemptInput): Promise<void>;
  countFailures(input: CountFailuresInput): Promise<number>;
  /** 成功登录后清除该用户名维度的失败记录 */
  clearForUser(kind: AttemptKind, usernameCanonical: string): Promise<void>;
}
