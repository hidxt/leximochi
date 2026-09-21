import { ChallengeCaptchaProvider } from '../src/modules/auth/captcha/challenge-captcha.provider';

describe('ChallengeCaptchaProvider', () => {
  const provider = new ChallengeCaptchaProvider({ captchaSecret: 'c'.repeat(40) });

  it('签发挑战并通过正确答案校验', async () => {
    const challenge = await provider.issue({ ip: '127.0.0.1' });
    const answer = provider.solveForTest(challenge.token);
    await expect(
      provider.verify({ token: challenge.token, answer, ip: '127.0.0.1' }),
    ).resolves.toBe(true);
  });

  it('拒绝错误答案', async () => {
    const challenge = await provider.issue({ ip: '127.0.0.1' });
    await expect(
      provider.verify({ token: challenge.token, answer: '9999', ip: '127.0.0.1' }),
    ).resolves.toBe(false);
  });

  it('挑战只能使用一次', async () => {
    const challenge = await provider.issue({ ip: '127.0.0.1' });
    const answer = provider.solveForTest(challenge.token);
    await provider.verify({ token: challenge.token, answer, ip: '127.0.0.1' });
    await expect(
      provider.verify({ token: challenge.token, answer, ip: '127.0.0.1' }),
    ).resolves.toBe(false);
  });

  it('拒绝被篡改的 token', async () => {
    const challenge = await provider.issue({ ip: '127.0.0.1' });
    const tampered = `${challenge.token.slice(0, -2)}xx`;
    await expect(
      provider.verify({ token: tampered, answer: '0', ip: '127.0.0.1' }),
    ).resolves.toBe(false);
  });

  it('拒绝过期挑战', async () => {
    let now = 1_000_000;
    const providerWithClock = new ChallengeCaptchaProvider({
      captchaSecret: 'c'.repeat(40),
      now: () => now,
    });
    const challenge = await providerWithClock.issue({ ip: null });
    const answer = providerWithClock.solveForTest(challenge.token);
    now += 200_000;
    await expect(
      providerWithClock.verify({ token: challenge.token, answer, ip: null }),
    ).resolves.toBe(false);
  });

  it('绑定 IP：换 IP 后校验失败', async () => {
    const challenge = await provider.issue({ ip: '10.0.0.1' });
    const answer = provider.solveForTest(challenge.token);
    await expect(
      provider.verify({ token: challenge.token, answer, ip: '10.0.0.2' }),
    ).resolves.toBe(false);
  });
});
