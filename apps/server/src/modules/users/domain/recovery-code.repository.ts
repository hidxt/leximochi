export const RECOVERY_CODE_REPOSITORY = 'RECOVERY_CODE_REPOSITORY';

export interface RecoveryCodeRepository {
  /** 删除该用户全部旧码并写入新码（同一事务） */
  replaceAllForUser(userId: string, codeHashes: string[], now: number): Promise<void>;
  /** 条件更新：影响行数为 1 才算消费成功 */
  consume(userId: string, codeId: string, now: number, ip: string | null): Promise<boolean>;
  listUnused(userId: string): Promise<Array<{ id: string; codeHash: string }>>;
  countUnused(userId: string): Promise<number>;
}
