import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// 该接口扩展是 jest-dom 官方推荐的 vitest 类型接入方式，成员继承自父接口
declare module 'vitest' {
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type */
  interface Assertion<T = any> extends TestingLibraryMatchers<unknown, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}
