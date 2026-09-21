import type { CaptchaChallenge } from '@leximochi/types';

export const CAPTCHA_PROVIDER = 'CAPTCHA_PROVIDER';

export interface CaptchaProvider {
  issue(ctx: { ip: string | null }): Promise<CaptchaChallenge>;
  verify(input: { token: string; answer: string; ip: string | null }): Promise<boolean>;
}
