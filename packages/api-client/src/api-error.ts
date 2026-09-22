import type { ErrorCode } from '@leximochi/types';

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly requestId: string;
  readonly details?: Record<string, string[]>;

  constructor(input: {
    code: ErrorCode;
    message: string;
    status: number;
    requestId: string;
    details?: Record<string, string[]>;
  }) {
    super(input.message);
    this.name = 'ApiError';
    this.code = input.code;
    this.status = input.status;
    this.requestId = input.requestId;
    this.details = input.details;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
