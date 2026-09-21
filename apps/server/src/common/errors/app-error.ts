import { ErrorCode } from '@leximochi/types';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, string[]>;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus: number,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
