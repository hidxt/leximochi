import { adminEndpoints } from './endpoints/admin.endpoints';
import { adminVocabularyEndpoints } from './endpoints/admin-vocabulary.endpoints';
import { authEndpoints } from './endpoints/auth.endpoints';
import {
  notebookEndpoints,
  reviewEndpoints,
  vocabularyEndpoints,
} from './endpoints/vocabulary.endpoints';
import { HttpClient, type HttpClientOptions } from './http-client';

export * from './api-error';
export * from './http-client';
export type { AdminUserQuery, AuditLogQuery } from './endpoints/admin.endpoints';
export type {
  AdminWordbookDetail,
  AdminWordContentInput,
  AdminWordQuery,
  ImportWordsResult,
} from './endpoints/admin-vocabulary.endpoints';
export type { RefreshResult } from './endpoints/auth.endpoints';
export type { AddNotebookInput, SearchWordsQuery } from './endpoints/vocabulary.endpoints';

export function createApiClient(options: HttpClientOptions) {
  const http = new HttpClient(options);
  return {
    health: () => http.request<{ status: string; uptimeSeconds: number }>('/health', { anonymous: true }),
    auth: authEndpoints(http),
    vocabulary: vocabularyEndpoints(http),
    review: reviewEndpoints(http),
    notebook: notebookEndpoints(http),
    admin: { ...adminEndpoints(http), vocabulary: adminVocabularyEndpoints(http) },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
