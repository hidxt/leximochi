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

export interface WordbookRepository {
  list(): Promise<WordbookRecord[]>;
  findByKey(key: string): Promise<WordbookRecord | null>;
  findById(id: string): Promise<WordbookRecord | null>;
}
