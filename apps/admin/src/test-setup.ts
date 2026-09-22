import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, expect } from 'vitest';

// 不使用 '@testing-library/jest-dom/vitest' 入口：该文件会自行 import 'vitest'，
// 而 vitest 被 npm 嵌套安装在本 workspace 内、jest-dom 在根 node_modules，导致解析失败。
expect.extend(matchers);

// 未启用 vitest globals 时 RTL 不会自动清理，需显式注册
afterEach(() => {
  cleanup();
});
