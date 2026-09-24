export const WORDBOOK_REPOSITORY = 'WORDBOOK_REPOSITORY';

export interface WordbookRecord {
  id: string;
  key: string;
  name: string;
  description: string | null;
  language: string;
  isSystem: boolean;
  version: number;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateWordbookInput {
  key: string;
  name: string;
  description?: string | null;
  language?: string;
  isSystem?: boolean;
}

/** 只允许改元数据：词数/版本由词条写入流程维护，不接受客户端提交 */
export interface UpdateWordbookInput {
  name?: string;
  description?: string | null;
  language?: string;
  isSystem?: boolean;
}

export interface WordbookRepository {
  list(): Promise<WordbookRecord[]>;
  findByKey(key: string): Promise<WordbookRecord | null>;
  findById(id: string): Promise<WordbookRecord | null>;
  /** 新建词库（key 冲突由调用方先检查，数据库唯一约束兜底） */
  create(input: CreateWordbookInput): Promise<WordbookRecord>;
  update(id: string, input: UpdateWordbookInput): Promise<WordbookRecord | null>;
  /** 删除词库（仅解除词库与词条的关联，共享词条本身不会被删除） */
  delete(id: string): Promise<boolean>;
}
