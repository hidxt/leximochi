import { Inject, Injectable } from '@nestjs/common';
import type { AdminUserPage, AdminUserSummary, AuditLogPage } from '@leximochi/types';
import { ErrorCode } from '@leximochi/types';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { SESSION_REPOSITORY, type SessionRepository } from '../auth/domain/session.repository';
import { USER_REPOSITORY, type UserRepository } from '../users/domain/user.repository';
import type { ListAuditDto, ListUsersDto } from './dto/list-users.dto';

export interface AdminRequestContext {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    private readonly audit: AuditService,
  ) {}

  async listUsers(query: ListUsersDto): Promise<AdminUserPage> {
    const result = await this.users.listForAdmin({
      query: query.query,
      status: query.status,
      limit: query.limit ?? 20,
      cursor: query.cursor,
    });
    return {
      items: result.items.map(toSummary),
      nextCursor: result.nextCursor,
    };
  }

  async getUser(userId: string): Promise<AdminUserSummary> {
    const item = await this.users.findAdminItemById(userId);
    if (!item) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, '用户不存在', 404);
    }
    return toSummary(item);
  }

  async banUser(
    actor: AuthenticatedUser,
    targetUserId: string,
    reason: string,
    ctx: AdminRequestContext,
  ): Promise<void> {
    if (actor.userId === targetUserId) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, '不能封禁自己', 400);
    }
    const target = await this.users.findById(targetUserId);
    if (!target) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, '用户不存在', 404);
    }

    const now = Date.now();
    await this.users.setStatus(targetUserId, 'banned', {
      reason,
      actorId: actor.userId,
      now,
    });
    await this.sessions.revokeAllForUser(targetUserId, 'banned', now);
    await this.audit.record({
      actorUserId: actor.userId,
      actorType: 'admin',
      action: 'admin.user.banned',
      targetType: 'user',
      targetId: targetUserId,
      result: 'success',
      metadata: { reason },
      ...ctx,
    });
  }

  async unbanUser(
    actor: AuthenticatedUser,
    targetUserId: string,
    ctx: AdminRequestContext,
  ): Promise<void> {
    const target = await this.users.findById(targetUserId);
    if (!target) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, '用户不存在', 404);
    }

    await this.users.setStatus(targetUserId, 'active', {
      reason: null,
      actorId: actor.userId,
      now: Date.now(),
    });
    // 不恢复封禁前的会话：解封后需重新登录
    await this.audit.record({
      actorUserId: actor.userId,
      actorType: 'admin',
      action: 'admin.user.unbanned',
      targetType: 'user',
      targetId: targetUserId,
      result: 'success',
      ...ctx,
    });
  }

  listAuditLogs(query: ListAuditDto): Promise<AuditLogPage> {
    return this.audit.list({
      action: query.action,
      actorUserId: query.actorUserId,
      targetId: query.targetId,
      targetType: query.targetType,
      limit: query.limit ?? 20,
      cursor: query.cursor,
    });
  }
}

function toSummary(item: {
  id: string;
  username: string;
  status: 'active' | 'banned';
  roles: string[];
  createdAt: number;
  lastLoginAt: number | null;
}): AdminUserSummary {
  return {
    id: item.id,
    username: item.username,
    status: item.status,
    roles: item.roles,
    createdAt: item.createdAt,
    lastLoginAt: item.lastLoginAt,
  };
}
