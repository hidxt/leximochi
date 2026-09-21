import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AUDIT_REPOSITORY,
  type AuditQuery,
  type AuditRecordInput,
  type AuditRepository,
} from './domain/audit.repository';

@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_REPOSITORY) private readonly repository: AuditRepository) {}

  /** 审计写入失败不得阻断主流程；失败会被全局异常过滤器之上的调用方忽略 */
  async record(input: AuditRecordInput): Promise<void> {
    try {
      await this.repository.insert({ ...input, id: randomUUID(), createdAt: Date.now() });
    } catch {
      // 有意吞掉异常：审计故障不应影响用户可用性（Phase 7 增加持久化告警）
    }
  }

  list(query: AuditQuery) {
    return this.repository.list(query);
  }
}
