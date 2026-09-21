import type { ErrorCode } from './error-code';

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  requestId: string;
  details?: Record<string, string[]>;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
}

export interface ApiSuccessResponse<T> {
  data: T;
}
