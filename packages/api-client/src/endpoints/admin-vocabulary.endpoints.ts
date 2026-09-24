import type {
  AdminAudioUploadResponse,
  AdminWordListItem,
  AdminWordPage,
  WordDetail,
  WordbookSummary,
} from '@leximochi/types';
import type { HttpClient } from '../http-client';

export interface AdminWordQuery {
  query?: string;
  wordbookId?: string;
  limit?: number;
  cursor?: string;
}

export interface AdminWordbookDetail extends WordbookSummary {
  createdAt: number;
  updatedAt: number;
}

export interface AdminWordContentInput {
  headword: string;
  phoneticUk?: string;
  phoneticUs?: string;
  rank?: number;
  tags?: string[];
  senses: Array<{
    partOfSpeech?: string;
    definitionZh: string;
    definitionEn?: string;
    examMeaning?: string;
  }>;
  examples?: Array<{ textEn: string; textZh: string }>;
  phrases?: Array<{ kind?: 'phrase' | 'collocation'; text: string; translation: string }>;
  forms?: Array<{ formType: string; value: string }>;
  relations?: Array<{
    relationType: 'synonym' | 'antonym' | 'confusable' | 'derived';
    targetWordId?: string;
    targetText?: string;
  }>;
}

export interface ImportWordsResult {
  wordbookKey: string;
  created: number;
  updated: number;
  failed: Array<{ index: number; headword: string | null; reason: string }>;
  version: number;
  wordCount: number;
}

/** 后台词库/词条管理（需要对应权限；删除类操作必须显式传 confirm） */
export function adminVocabularyEndpoints(http: HttpClient) {
  return {
    listWordbooks: () => http.request<AdminWordbookDetail[]>('/admin/wordbooks'),
    getWordbook: (id: string) =>
      http.request<AdminWordbookDetail>(`/admin/wordbooks/${encodeURIComponent(id)}`),
    createWordbook: (input: {
      key: string;
      name: string;
      description?: string;
      language?: string;
      isSystem?: boolean;
    }) => http.request<AdminWordbookDetail>('/admin/wordbooks', { method: 'POST', body: input }),
    updateWordbook: (
      id: string,
      input: { name?: string; description?: string; language?: string; isSystem?: boolean },
    ) =>
      http.request<AdminWordbookDetail>(`/admin/wordbooks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: input,
      }),
    deleteWordbook: (id: string) =>
      http.request<{ deleted: true }>(`/admin/wordbooks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        // 高风险操作：服务端要求显式二次确认，这里固定传 true，界面另有确认弹窗
        body: { confirm: true },
      }),

    listWords: (query: AdminWordQuery = {}) =>
      http.request<AdminWordPage>('/admin/words', { query: { ...query } }),
    getWord: (id: string) => http.request<WordDetail>(`/admin/words/${encodeURIComponent(id)}`),
    createWord: (input: AdminWordContentInput & { wordbookId: string }) =>
      http.request<{ wordId: string; created: boolean }>('/admin/words', {
        method: 'POST',
        body: input,
      }),
    updateWord: (id: string, input: AdminWordContentInput) =>
      http.request<{ wordId: string; created: boolean }>(`/admin/words/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: input,
      }),
    deleteWord: (id: string) =>
      http.request<{ deleted: boolean }>(`/admin/words/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        body: { confirm: true },
      }),
    importWords: (input: {
      wordbookKey: string;
      wordbookName: string;
      description?: string;
      items: Array<Record<string, unknown>>;
    }) => http.request<ImportWordsResult>('/admin/words/import', { method: 'POST', body: input }),

    /** 上传发音音频：multipart/form-data（字段 `file` + `kind`） */
    uploadWordAudio: (id: string, kind: 'uk' | 'us', file: File) => {
      const form = new FormData();
      form.append('kind', kind);
      form.append('file', file);
      return http.request<AdminAudioUploadResponse>(
        `/admin/words/${encodeURIComponent(id)}/audio`,
        { method: 'POST', body: form },
      );
    },
  };
}

export type AdminWordListItemDto = AdminWordListItem;
