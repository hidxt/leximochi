import type { PublicUser } from '@leximochi/types';

export const USER_REPOSITORY = 'USER_REPOSITORY';

export interface UserRecord {
  id: string;
  username: string;
  usernameCanonical: string;
  passwordHash: string;
  passwordAlgo: string;
  status: 'active' | 'banned';
  bannedReason: string | null;
  createdAt: number;
  lastLoginAt: number | null;
}

export interface CreateUserInput {
  username: string;
  usernameCanonical: string;
  passwordHash: string;
  now: number;
}

export interface AdminUserFilter {
  query?: string;
  status?: 'active' | 'banned';
  limit: number;
  cursor?: string;
}

export interface AdminUserItem {
  id: string;
  username: string;
  status: 'active' | 'banned';
  roles: string[];
  createdAt: number;
  lastLoginAt: number | null;
}

export interface AdminUserListResult {
  items: AdminUserItem[];
  nextCursor: string | null;
}

export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByUsernameCanonical(canonical: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
  /** 仅用于注册流程失败补偿 */
  removeById(id: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string, now: number): Promise<void>;
  setStatus(
    userId: string,
    status: 'active' | 'banned',
    ctx: { reason: string | null; actorId: string | null; now: number },
  ): Promise<void>;
  touchLastLogin(userId: string, now: number): Promise<void>;
  listRoles(userId: string): Promise<string[]>;
  listPermissions(userId: string): Promise<string[]>;
  toPublicUser(record: UserRecord): Promise<PublicUser>;
  /** 后台：分页查询用户（不返回任何凭证字段） */
  listForAdmin(filter: AdminUserFilter): Promise<AdminUserListResult>;
  /** 后台：单个用户摘要 */
  findAdminItemById(id: string): Promise<AdminUserItem | null>;
}
