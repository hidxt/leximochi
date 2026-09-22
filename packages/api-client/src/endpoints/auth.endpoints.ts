import type {
  CaptchaChallenge,
  LoginResponse,
  MeResponse,
  RecoveryResponse,
  RegisterResponse,
  SessionSummary,
} from '@leximochi/types';
import type { HttpClient } from '../http-client';

export interface RefreshResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export function authEndpoints(http: HttpClient) {
  return {
    issueCaptcha: () =>
      http.request<CaptchaChallenge>('/auth/captcha', { method: 'POST', anonymous: true }),

    register: (input: {
      username: string;
      password: string;
      captchaToken: string;
      captchaAnswer: string;
    }) =>
      http.request<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: input,
        anonymous: true,
      }),

    login: (input: { username: string; password: string }) =>
      http.request<LoginResponse>('/auth/login', { method: 'POST', body: input, anonymous: true }),

    refresh: (input: { refreshToken?: string } = {}) =>
      http.request<RefreshResult>('/auth/refresh', { method: 'POST', body: input, anonymous: true }),

    logout: (input: { refreshToken?: string } = {}) =>
      http.request<{ ok: boolean }>('/auth/logout', { method: 'POST', body: input }),

    logoutAll: () => http.request<{ ok: boolean }>('/auth/logout-all', { method: 'POST', body: {} }),

    me: () => http.request<MeResponse>('/auth/me'),

    listSessions: () => http.request<SessionSummary[]>('/auth/sessions'),

    deleteSession: (id: string) =>
      http.request<{ ok: boolean }>(`/auth/sessions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),

    recover: (input: {
      username: string;
      recoveryCode: string;
      newPassword: string;
      captchaToken: string;
      captchaAnswer: string;
    }) =>
      http.request<RecoveryResponse>('/auth/recovery', {
        method: 'POST',
        body: input,
        anonymous: true,
      }),
  };
}
