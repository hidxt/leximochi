import { RateLimitService } from '../src/modules/auth/rate-limit.service';
import type { AuthAttemptRepository } from '../src/modules/auth/domain/auth-attempt.repository';

function fakeRepository(sequence: number[]): AuthAttemptRepository {
  let index = 0;
  return {
    record: async () => undefined,
    countFailures: async () => sequence[index++] ?? 0,
    clearForUser: async () => undefined,
  };
}

const lockout = { maxFailuresPerUser: 5, maxFailuresPerIp: 20, windowMinutes: 15 };

describe('RateLimitService', () => {
  it('未达阈值时放行', async () => {
    const service = new RateLimitService(fakeRepository([4, 1]), lockout);
    await expect(
      service.assertLoginAllowed({ usernameCanonical: 'a', ip: '1.1.1.1' }),
    ).resolves.toBeUndefined();
  });

  it('用户名维度达阈值时拒绝（锁定）', async () => {
    const service = new RateLimitService(fakeRepository([5, 0]), lockout);
    await expect(
      service.assertLoginAllowed({ usernameCanonical: 'a', ip: '1.1.1.1' }),
    ).rejects.toMatchObject({ code: 'AUTH_ACCOUNT_LOCKED', httpStatus: 429 });
  });

  it('IP 维度达阈值时拒绝（限流）', async () => {
    const service = new RateLimitService(fakeRepository([0, 20]), lockout);
    await expect(
      service.assertLoginAllowed({ usernameCanonical: 'a', ip: '1.1.1.1' }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', httpStatus: 429 });
  });

  it('窗口时长按配置计算', () => {
    const service = new RateLimitService(fakeRepository([]), lockout);
    expect(service.windowMs()).toBe(15 * 60 * 1000);
  });

  it('无 IP 时跳过 IP 维度检查', async () => {
    const service = new RateLimitService(fakeRepository([0]), lockout);
    await expect(
      service.assertLoginAllowed({ usernameCanonical: 'a', ip: null }),
    ).resolves.toBeUndefined();
  });
});
