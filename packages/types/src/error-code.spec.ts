import { ErrorCode, isErrorCode } from './error-code';

describe('ErrorCode', () => {
  it('暴露认证类错误码', () => {
    expect(ErrorCode.AUTH_INVALID_CREDENTIALS).toBe('AUTH_INVALID_CREDENTIALS');
    expect(ErrorCode.AUTH_USERNAME_TAKEN).toBe('AUTH_USERNAME_TAKEN');
    expect(ErrorCode.AUTH_ACCOUNT_BANNED).toBe('AUTH_ACCOUNT_BANNED');
    expect(ErrorCode.AUTH_ACCOUNT_LOCKED).toBe('AUTH_ACCOUNT_LOCKED');
    expect(ErrorCode.AUTH_RECOVERY_CODE_INVALID).toBe('AUTH_RECOVERY_CODE_INVALID');
    expect(ErrorCode.AUTH_TOKEN_INVALID).toBe('AUTH_TOKEN_INVALID');
    expect(ErrorCode.AUTH_TOKEN_REUSE_DETECTED).toBe('AUTH_TOKEN_REUSE_DETECTED');
  });

  it('暴露权限与通用错误码', () => {
    expect(ErrorCode.FORBIDDEN).toBe('FORBIDDEN');
    expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
    expect(ErrorCode.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
    expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
    expect(ErrorCode.CAPTCHA_FAILED).toBe('CAPTCHA_FAILED');
    expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
  });

  it('isErrorCode 只接受已知取值', () => {
    expect(isErrorCode('AUTH_TOKEN_INVALID')).toBe(true);
    expect(isErrorCode('NOT_A_CODE')).toBe(false);
  });
});
