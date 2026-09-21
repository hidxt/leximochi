const PLACEHOLDER_SECRETS = new Set([
  'replace-with-at-least-32-random-characters',
  'changeme',
  'change-me',
]);
const MIN_SECRET_LENGTH = 32;

export interface ServerConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  dataDir: string;
  databasePath: string;
  corsOrigins: string[];
  jwtSecret: string;
  refreshTokenSecret: string;
  captchaSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  recoveryCodeCount: number;
  cookieSecure: boolean;
  lockout: { maxFailuresPerUser: number; maxFailuresPerIp: number; windowMinutes: number };
}

export class ConfigError extends Error {}

function requireSecret(env: NodeJS.ProcessEnv, key: string): string {
  const raw = env[key];
  if (!raw || raw.trim().length === 0) {
    throw new ConfigError(`缺少必需环境变量: ${key}`);
  }
  const value = raw.trim();
  if (value.length < MIN_SECRET_LENGTH || PLACEHOLDER_SECRETS.has(value)) {
    throw new ConfigError(`环境变量 ${key} 长度不足 ${MIN_SECRET_LENGTH} 或仍为占位值`);
  }
  return value;
}

function requireInt(
  env: NodeJS.ProcessEnv,
  key: string,
  opts: { min: number; max: number },
): number {
  const raw = env[key];
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value < opts.min || value > opts.max) {
    throw new ConfigError(`环境变量 ${key} 必须是 ${opts.min}-${opts.max} 之间的整数`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new ConfigError('NODE_ENV 必须是 development/test/production 之一');
  }
  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (corsOrigins.length === 0) {
    throw new ConfigError('CORS_ORIGINS 不能为空');
  }
  if (corsOrigins.includes('*')) {
    throw new ConfigError('CORS_ORIGINS 禁止使用通配符 *');
  }
  return {
    env: nodeEnv as ServerConfig['env'],
    port: requireInt(env, 'PORT', { min: 1, max: 65535 }),
    dataDir: env.DATA_DIR?.trim() || './data',
    databasePath: env.DATABASE_PATH?.trim() || './data/db/leximochi.sqlite',
    corsOrigins,
    jwtSecret: requireSecret(env, 'JWT_SECRET'),
    refreshTokenSecret: requireSecret(env, 'REFRESH_TOKEN_SECRET'),
    captchaSecret: requireSecret(env, 'CAPTCHA_SECRET'),
    accessTokenTtlSeconds: requireInt(env, 'ACCESS_TOKEN_TTL_SECONDS', { min: 60, max: 3600 }),
    refreshTokenTtlDays: requireInt(env, 'REFRESH_TOKEN_TTL_DAYS', { min: 1, max: 365 }),
    recoveryCodeCount: requireInt(env, 'RECOVERY_CODE_COUNT', { min: 1, max: 50 }),
    cookieSecure: env.COOKIE_SECURE === 'true',
    lockout: {
      maxFailuresPerUser: requireInt(env, 'LOGIN_MAX_FAILURES_PER_USER', { min: 1, max: 100 }),
      maxFailuresPerIp: requireInt(env, 'LOGIN_MAX_FAILURES_PER_IP', { min: 1, max: 1000 }),
      windowMinutes: requireInt(env, 'LOCKOUT_WINDOW_MINUTES', { min: 1, max: 1440 }),
    },
  };
}
