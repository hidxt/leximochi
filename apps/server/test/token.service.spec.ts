import { TokenService } from '../src/modules/auth/token.service';

const baseOptions = {
  jwtSecret: 'j'.repeat(40),
  refreshTokenSecret: 'r'.repeat(40),
  accessTokenTtlSeconds: 900,
  refreshTokenTtlDays: 30,
};

describe('TokenService', () => {
  const service = new TokenService(baseOptions);

  it('签发并校验 access token', async () => {
    const token = await service.signAccessToken({ userId: 'u1', sessionId: 's1', roles: ['user'] });
    const payload = await service.verifyAccessToken(token);
    expect(payload.sub).toBe('u1');
    expect(payload.sid).toBe('s1');
    expect(payload.roles).toEqual(['user']);
  });

  it('被篡改的 access token 校验失败', async () => {
    const token = await service.signAccessToken({ userId: 'u1', sessionId: 's1', roles: [] });
    await expect(service.verifyAccessToken(`${token}x`)).rejects.toThrow();
  });

  it('使用不同密钥签发的 token 校验失败', async () => {
    const other = new TokenService({ ...baseOptions, jwtSecret: 'x'.repeat(40) });
    const token = await other.signAccessToken({ userId: 'u1', sessionId: 's1', roles: [] });
    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('refresh token 为高熵随机串，哈希稳定且不同密钥下哈希不同', () => {
    const first = service.createRefreshToken();
    const second = service.createRefreshToken();
    expect(first.token).not.toBe(second.token);
    expect(first.token.length).toBeGreaterThanOrEqual(43);
    expect(service.hashRefreshToken(first.token)).toBe(first.hash);
    expect(first.hash).not.toContain(first.token);

    const other = new TokenService({ ...baseOptions, refreshTokenSecret: 'y'.repeat(40) });
    expect(other.hashRefreshToken(first.token)).not.toBe(first.hash);
  });

  it('refresh token 过期时间按配置的天数计算', () => {
    const expiry = service.refreshTokenExpiry(1_000_000);
    expect(expiry).toBe(1_000_000 + 30 * 24 * 60 * 60 * 1000);
  });
});
