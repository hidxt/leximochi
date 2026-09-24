import type {
  NotebookAddResponse,
  NotebookPage,
  NotebookSource,
  ReviewHistoryPage,
  ReviewStats,
  SpellingErrorSummary,
  StudyNextRequest,
  StudyNextResponse,
  SubmitReviewRequest,
  SubmitReviewResponse,
  WordDetail,
  WordPage,
  WordSearchItem,
  WordbookSummary,
  WordbookVersionInfo,
} from '@leximochi/types';
import type { HttpClient } from '../http-client';

export interface SearchWordsQuery {
  q: string;
  wordbookKey?: string;
  limit?: number;
}

export interface AddNotebookInput {
  wordId: string;
  note?: string;
  source?: NotebookSource;
}

/** 词库与词条（只读，需登录） */
export function vocabularyEndpoints(http: HttpClient) {
  return {
    listWordbooks: () => http.request<WordbookSummary[]>('/wordbooks'),
    wordbookVersion: (key: string) =>
      http.request<WordbookVersionInfo>(`/wordbooks/${encodeURIComponent(key)}/version`),
    exportWords: (key: string, query: { cursor?: string; limit?: number } = {}) =>
      http.request<WordPage>(`/wordbooks/${encodeURIComponent(key)}/words`, { query }),
    searchWords: (query: SearchWordsQuery) =>
      http.request<WordSearchItem[]>('/words/search', { query: { ...query } }),
    wordDetail: (wordId: string) => http.request<WordDetail>(`/words/${encodeURIComponent(wordId)}`),
  };
}

/**
 * 学习与复习。客户端只提交「答题事实」（题目类型、原始答案、用时、幂等键），
 * 判定、评分与调度全部由服务端完成。
 */
export function reviewEndpoints(http: HttpClient) {
  return {
    next: (body: StudyNextRequest) =>
      http.request<StudyNextResponse>('/study/next', { method: 'POST', body }),
    /** `eventId` 由客户端生成并复用，保证重试/离线补传不会重复计分 */
    submit: (body: SubmitReviewRequest) =>
      http.request<SubmitReviewResponse>('/review/submit', { method: 'POST', body }),
    spellingErrors: (limit?: number) =>
      http.request<SpellingErrorSummary>('/review/spelling-errors', { query: { limit } }),
    history: (query: { cursor?: string; limit?: number } = {}) =>
      http.request<ReviewHistoryPage>('/review/history', { query }),
    stats: () => http.request<ReviewStats>('/review/stats'),
  };
}

/** 生词本 */
export function notebookEndpoints(http: HttpClient) {
  return {
    list: (query: { cursor?: string; limit?: number } = {}) =>
      http.request<NotebookPage>('/notebook', { query }),
    add: (input: AddNotebookInput) =>
      http.request<NotebookAddResponse>('/notebook', { method: 'POST', body: input }),
    remove: (wordId: string) =>
      http.request<{ removed: true }>(`/notebook/${encodeURIComponent(wordId)}`, {
        method: 'DELETE',
      }),
  };
}
