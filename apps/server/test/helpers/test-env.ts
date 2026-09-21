import { loadConfig, type ServerConfig } from '../../src/config/configuration';

export function buildTestEnv(overrides: NodeJS.ProcessEnv = {}): ServerConfig {
  return loadConfig({
    NODE_ENV: 'test',
    PORT: '3001',
    DATA_DIR: './data',
    DATABASE_PATH: ':memory:',
    CORS_ORIGINS: 'http://localhost:5173',
    JWT_SECRET: 'test-jwt-secret-value-0123456789abcdef',
    REFRESH_TOKEN_SECRET: 'test-refresh-secret-0123456789abcdef',
    CAPTCHA_SECRET: 'test-captcha-secret-0123456789abcdef',
    ACCESS_TOKEN_TTL_SECONDS: '900',
    REFRESH_TOKEN_TTL_DAYS: '30',
    RECOVERY_CODE_COUNT: '10',
    LOGIN_MAX_FAILURES_PER_USER: '5',
    LOGIN_MAX_FAILURES_PER_IP: '20',
    LOCKOUT_WINDOW_MINUTES: '15',
    COOKIE_SECURE: 'false',
    ...overrides,
  });
}
