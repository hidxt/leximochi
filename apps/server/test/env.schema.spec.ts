import { loadConfig } from '../src/config/configuration';

const validEnv = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATA_DIR: './data',
  DATABASE_PATH: ':memory:',
  CORS_ORIGINS: 'http://localhost:5173',
  JWT_SECRET: 'a'.repeat(40),
  REFRESH_TOKEN_SECRET: 'b'.repeat(40),
  CAPTCHA_SECRET: 'c'.repeat(40),
  ACCESS_TOKEN_TTL_SECONDS: '900',
  REFRESH_TOKEN_TTL_DAYS: '30',
  RECOVERY_CODE_COUNT: '10',
  LOGIN_MAX_FAILURES_PER_USER: '5',
  LOGIN_MAX_FAILURES_PER_IP: '20',
  LOCKOUT_WINDOW_MINUTES: '15',
  COOKIE_SECURE: 'false',
} as NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('解析合法环境变量', () => {
    const config = loadConfig(validEnv);
    expect(config.port).toBe(3000);
    expect(config.accessTokenTtlSeconds).toBe(900);
    expect(config.corsOrigins).toEqual(['http://localhost:5173']);
    expect(config.cookieSecure).toBe(false);
  });

  it('缺少必需秘密时抛错', () => {
    const env = { ...validEnv };
    delete env.JWT_SECRET;
    expect(() => loadConfig(env)).toThrow(/JWT_SECRET/);
  });

  it('拒绝过短秘密与占位值', () => {
    expect(() => loadConfig({ ...validEnv, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() =>
      loadConfig({ ...validEnv, JWT_SECRET: 'replace-with-at-least-32-random-characters' }),
    ).toThrow(/JWT_SECRET/);
  });

  it('拒绝非法端口与非法 TTL', () => {
    expect(() => loadConfig({ ...validEnv, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ ...validEnv, ACCESS_TOKEN_TTL_SECONDS: '0' })).toThrow(
      /ACCESS_TOKEN_TTL_SECONDS/,
    );
  });

  it('拒绝通配符 CORS', () => {
    expect(() => loadConfig({ ...validEnv, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
  });

  it('错误信息不包含秘密值', () => {
    try {
      loadConfig({ ...validEnv, JWT_SECRET: 'short' });
    } catch (error) {
      expect(String(error)).not.toContain('short');
    }
  });
});
