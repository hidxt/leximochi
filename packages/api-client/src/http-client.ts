import { ErrorCode, type ApiErrorResponse } from '@leximochi/types';
import { ApiError } from './api-error';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  baseUrl: string;
  fetch?: FetchLike;
  getAccessToken?: () => string | null;
  /** Web/Admin 使用 Cookie 承载 refresh token 时设为 'include' */
  credentials?: RequestCredentials;
  /** 客户端类型标记：'mobile' 时 refresh token 走 Body */
  clientType?: 'web' | 'mobile';
  onUnauthorized?: () => void;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  anonymous?: boolean;
}

export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  async request<T>(path: string, request: RequestOptions = {}): Promise<T> {
    const url = new URL(path, this.options.baseUrl);
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = { accept: 'application/json' };
    if (request.body !== undefined) headers['content-type'] = 'application/json';
    const token = this.options.getAccessToken?.();
    if (token && !request.anonymous) headers.authorization = `Bearer ${token}`;
    if (this.options.clientType) headers['x-client-type'] = this.options.clientType;

    const fetchImpl = this.options.fetch ?? (globalThis.fetch as FetchLike);
    const response = await fetchImpl(url.toString(), {
      method: request.method ?? 'GET',
      headers,
      credentials: this.options.credentials ?? 'omit',
      ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
    });

    if (!response.ok) {
      const error = await this.toApiError(response);
      if (error.status === 401) this.options.onUnauthorized?.();
      throw error;
    }

    const payload = (await response.json()) as { data: T };
    return payload.data;
  }

  private async toApiError(response: Response): Promise<ApiError> {
    try {
      const body = (await response.json()) as ApiErrorResponse;
      if (body?.error?.code) {
        return new ApiError({
          code: body.error.code,
          message: body.error.message,
          status: response.status,
          requestId: body.error.requestId ?? '',
          details: body.error.details,
        });
      }
    } catch {
      // 响应体不是 JSON，走统一兜底
    }
    return new ApiError({
      code: ErrorCode.INTERNAL_ERROR,
      message: '请求失败，请稍后重试',
      status: response.status,
      requestId: '',
    });
  }
}
