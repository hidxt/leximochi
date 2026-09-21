import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode, type ApiErrorResponse } from '@leximochi/types';
import { AppError } from '../errors/app-error';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = request.requestId ?? 'unknown';

    let status: number;
    let body: ApiErrorResponse;

    if (exception instanceof AppError) {
      status = exception.httpStatus;
      body = {
        error: {
          code: exception.code,
          message: exception.message,
          requestId,
          ...(exception.details ? { details: exception.details } : {}),
        },
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      body = {
        error: {
          code: STATUS_TO_CODE[status] ?? ErrorCode.INTERNAL_ERROR,
          message: Array.isArray(message) ? '请求参数不合法' : String(message),
          requestId,
        },
      };
    } else {
      status = 500;
      body = {
        error: { code: ErrorCode.INTERNAL_ERROR, message: '服务器内部错误', requestId },
      };
      this.logger.error(
        `未处理异常 requestId=${requestId} path=${request.url}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }
}
