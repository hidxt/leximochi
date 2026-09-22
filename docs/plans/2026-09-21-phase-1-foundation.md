# Leximochi Phase 1（项目地基）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐任务执行本计划。步骤使用 `- [ ]` 复选框跟踪。

**Goal:** 建立可运行、可测试、可交接的 Monorepo 地基：NestJS 服务端 + SQLite（WAL/migration）+ 用户名密码账号系统（人机验证抽象、恢复码、RBAC）+ Web/Admin/Android 三端骨架 + API SDK + 基础测试。

**Architecture:** npm workspaces Monorepo；`apps/*` 为四个可运行端，`packages/*` 为共享类型与纯业务规则。服务端是唯一权威业务方；客户端只提交输入与事件 ID，不决定任何结算结果。数据访问通过仓储接口与 Drizzle 实现解耦。

**Tech Stack:** TypeScript 6.0.3 · Node 24 · npm workspaces · NestJS 12.0.4 · SQLite（Drizzle 0.45.3 + better-sqlite3 13.0.3）· Argon2id（@node-rs/argon2 2.2.1）· React 19.2.3 + Vite 8.3.0 · React Native 0.87.1 · Jest 30 / Vitest 5。

**Spec:** `开发提示词.md`（需求基线）、`docs/architecture.md`（架构）、`docs/database-design.md`（ER）、`SECURITY-GUARDRAILS.md`（安全红线）

---

## Global Constraints

以下为项目级强制约束，**每个任务的要求都隐含包含本节**：

- 语言统一 TypeScript **6.0.3**（不使用 TypeScript 7.x）；Node **≥ 24.3.0**；包管理只用 **npm workspaces**（不安装 pnpm/Bun/Yarn/Turborepo）。
- 服务端为唯一权威结算方；客户端数据默认不可信；**禁止在客户端实现或复制奖励/结算规则**。
- 密码与恢复码必须 Argon2id 哈希；**禁止** MD5/SHA1/裸 SHA256/明文/可逆加密；禁止明文写入日志。
- 所有秘密来自环境变量或仓库外密钥文件；**禁止**提交真实 `.env`；缺失或为占位值时服务端**拒绝启动**。
- 错误响应禁止包含堆栈、SQL、SQLite 路径、文件系统结构、环境变量、Token、API Key。
- 时间统一**服务端生成 UTC 毫秒**；ID 用 UUID v4。
- 幂等以**唯一约束 / 条件更新影响行数**兜底，**禁止**「先查后写」式去重。
- 未获用户明确批准，**禁止**安装任何额外系统软件、SDK、CLI、模拟器镜像、构建工具（npm 项目依赖除外）。
- 未获明确授权，**禁止**执行 `git reset --hard`、`git push --force`、重写历史、大规模删除。
- GitHub 网络操作优先代理 `127.0.0.1:10808`，失败则直连，均失败则报告并停止重试。npm 使用现有 `registry.npmmirror.com` 配置。
- 每个任务结束必须**实际运行**该任务列出的验证命令并记录真实输出；**禁止**在没有证据时声称通过。
- 每个任务结束时提交独立 commit（Conventional Commits）。
- 版本严格按 `HANDOFF.md` 第 10.2 节清单，不擅自升级/降级。

---

## 文件结构总览（File Structure）

```
leximochi/
├── package.json                                   # npm workspaces 根 + 统一脚本
├── tsconfig.base.json                             # TS 基座
├── eslint.config.mjs                              # 扁平 ESLint 配置
├── .prettierrc.json
├── .gitignore / .gitattributes / .env.example
├── packages/
│   ├── types/      src/{index,error-code,permissions,limits,auth-dto,api-error}.ts
│   ├── core/       src/{index,username,password,recovery-code}.ts
│   ├── shared/     src/{index,tokens}.ts
│   ├── api-client/ src/{index,http-client,api-error,endpoints/*}.ts
│   └── auth/       src/{index,session-store,session-manager}.ts
├── apps/
│   ├── server/     src/{main,app.module}.ts src/config/* src/common/* src/database/*
│   │               src/modules/{health,auth,users,audit,admin}/* drizzle/*.sql
│   ├── web/        src/{main,App}.tsx src/pages/* src/lib/*
│   ├── admin/      src/{main,App}.tsx src/pages/* src/lib/*
│   └── mobile/     App.tsx src/* android/* metro.config.js
└── data/           （不入 Git）
```

**依赖方向（禁止反向依赖）**：`types`（叶子）← 其他所有包与 apps；`api-client` → `types`；`auth` → `types` + `api-client`；`core` → `types`；`shared` 不依赖其他包。

---

## 任务总览

| # | 任务 | 产出 |
| --- | --- | --- |
| 1 | Monorepo 地基与工程规范 | 可 `npm install`、全仓库脚本可跑的骨架 |
| 2 | `packages/types` | 错误码、权限键、限额、DTO 契约 |
| 3 | `packages/core` + `packages/shared` | 纯规则（用户名/密码/恢复码）+ 设计 Token |
| 4 | 服务端骨架与错误模型 | `/health`、启动期环境校验、统一错误响应 |
| 5 | 数据库层与 migration | PRAGMA 生效、schema、migration、种子角色 |
| 6 | 验证码抽象、仓储与注册 | `CaptchaProvider` + 注册全链路 |
| 7 | 登录与 Token 生命周期 | Access/Refresh、轮换、复用检测、设备会话 |
| 8 | 恢复码 | 一次性恢复码流程 + 全会话撤销 |
| 9 | 限流、暴力破解防护与审计接入 | 锁定策略 + 审计事件 |
| 10 | RBAC 与后台用户管理 | 权限守卫、封禁/解封、审计查询、越权测试 |
| 11 | `packages/api-client` + `packages/auth` | 类型安全客户端与会话管理器 |
| 12 | `apps/web` | 注册/登录/受保护首页/设备会话管理 |
| 13 | `apps/admin` | 管理员登录、用户列表、封禁（二次确认）、审计 |
| 14 | `apps/mobile` | RN 0.87.1 登录界面 + Metro/代理配置 + APK 构建 |
| 15 | 全量验收与安全自检 | 真实命令结果、验收报告、文档与 HANDOFF 更新 |

---

# Task 1: Monorepo 地基与工程规范

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `.gitattributes`, `.env.example`, `.prettierrc.json`, `eslint.config.mjs`, `README.md`
- Create: `scripts/verify-workspaces.mjs`
- Create: `packages/types/package.json`, `packages/types/tsconfig.json`, `packages/types/src/index.ts`（占位，Task 2 填充）

**Interfaces:**
- Consumes: 无
- Produces: 根脚本 `typecheck` / `lint` / `test` / `build`（`--workspaces --if-present`）；`tsconfig.base.json` 供所有 workspace 继承

- [ ] **Step 1: 写失败验证脚本**

`scripts/verify-workspaces.mjs`：

```js
import { readFileSync } from 'node:fs';

const root = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const expected = ['apps/*', 'packages/*'];
const missing = expected.filter((w) => !root.workspaces?.includes(w));
if (missing.length > 0) {
  console.error(`缺少 workspaces 配置: ${missing.join(', ')}`);
  process.exit(1);
}
for (const key of ['typecheck', 'lint', 'test', 'build']) {
  if (!root.scripts?.[key]) {
    console.error(`缺少根脚本: ${key}`);
    process.exit(1);
  }
}
if (root.engines?.node !== '>=24.3.0') {
  console.error('engines.node 必须为 >=24.3.0');
  process.exit(1);
}
console.log('workspaces 校验通过');
```

- [ ] **Step 2: 运行验证脚本，确认失败**

Run: `node scripts/verify-workspaces.mjs`
Expected: FAIL（根 `package.json` 尚不存在，读取失败）

- [ ] **Step 3: 创建根配置**

`package.json`：

```json
{
  "name": "leximochi",
  "version": "0.1.0",
  "private": true,
  "description": "Gamified English learning with vocabulary, AI speaking, listening practice, and a virtual pet companion.",
  "license": "Apache-2.0",
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": ">=24.3.0" },
  "scripts": {
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "verify:workspaces": "node scripts/verify-workspaces.mjs"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "typescript": "6.0.3",
    "typescript-eslint": "^8.0.0"
  }
}
```

`tsconfig.base.json`：

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "Node16",
    "moduleResolution": "Node16",
    "isolatedModules": true,
    "strict": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": []
  }
}
```

> 共享包统一编译为 **CommonJS + `.d.ts`**，因为 Vite、Metro、Jest、NestJS(tsc) 四类消费者都能直接解析 CJS 产物，避免为每个消费者维护别名配置。

`.gitignore`：

```
node_modules/
dist/
build/
coverage/
.env
.env.*
!.env.example
*.log
data/
.DS_Store
*.keystore
*.jks
*.p12
*.pem
*.key
apps/mobile/android/.gradle/
apps/mobile/android/app/build/
apps/mobile/android/build/
apps/mobile/android/local.properties
apps/mobile/.metro-health-check*
```

`.gitattributes`：

```
* text=auto eol=lf
*.png binary
*.jpg binary
*.ico binary
*.ttf binary
*.keystore binary
*.jks binary
```

`.env.example`（**仅占位符**）：

```
NODE_ENV=development
PORT=3000
DATA_DIR=./data
DATABASE_PATH=./data/db/leximochi.sqlite
CORS_ORIGINS=http://localhost:5173,http://localhost:5174

# 至少 32 字符；禁止使用本文件中的占位值作为真实值
JWT_SECRET=replace-with-at-least-32-random-characters
REFRESH_TOKEN_SECRET=replace-with-at-least-32-random-characters
CAPTCHA_SECRET=replace-with-at-least-32-random-characters

ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=30
RECOVERY_CODE_COUNT=10
LOGIN_MAX_FAILURES_PER_USER=5
LOGIN_MAX_FAILURES_PER_IP=20
LOCKOUT_WINDOW_MINUTES=15
COOKIE_SECURE=false
```

`packages/types/package.json`：

```json
{
  "name": "@leximochi/types",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src"
  }
}
```

`packages/types/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

`packages/types/src/index.ts`：`export {};`

`eslint.config.mjs`：

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/android/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
```

`.prettierrc.json`：

```json
{ "singleQuote": true, "printWidth": 100, "trailingComma": "all", "semi": true }
```

`README.md`：

```markdown
# Leximochi（词团子）

Gamified English learning with vocabulary, AI speaking, listening practice, and a virtual pet companion.

- 需求与开发约束基线：`开发提示词.md`
- 安全红线：`SECURITY-GUARDRAILS.md`
- 当前状态与交接：`HANDOFF.md`
- 架构与数据库：`docs/architecture.md`、`docs/database-design.md`
- 阶段计划：`docs/plans/`

## 开发环境要求

Node.js ≥ 24.3.0、npm 11、JDK 17、Android SDK（compileSdk 37 / buildTools 37.0.0 / NDK 27.1.12297006）。
完整环境检查结果见 `HANDOFF.md` 第 4、9 节。

## 常用命令

```bash
npm install          # 安装所有 workspace 依赖
npm run typecheck    # 全仓库类型检查
npm run lint         # 全仓库 lint
npm run test         # 全仓库测试
npm run build        # 全仓库构建
```

## 配置

复制 `.env.example` 为 `.env` 并填入真实值（`.env` 不入库）。服务端启动时校验必需变量，缺失或使用占位值时拒绝启动。
```

- [ ] **Step 4: 安装依赖并运行验证脚本**

Run: `npm install && node scripts/verify-workspaces.mjs`
Expected: 安装成功；输出 `workspaces 校验通过`

- [ ] **Step 5: 验证根脚本可运行**

Run: `npm run typecheck`
Expected: 退出码 0，无错误输出

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json .gitignore .gitattributes .env.example .prettierrc.json eslint.config.mjs README.md scripts/verify-workspaces.mjs packages/types
git commit -m "chore(monorepo): 初始化 npm workspaces 地基与工程规范"
```

---

# Task 2: packages/types（契约与错误码）

**Files:**
- Create: `packages/types/src/{error-code,permissions,limits,api-error,auth-dto}.ts`, `packages/types/jest.config.cjs`
- Modify: `packages/types/src/index.ts`, `packages/types/package.json`
- Test: `packages/types/src/error-code.spec.ts`

**Interfaces:**
- Consumes: 无
- Produces: `ErrorCode` / `isErrorCode`；`RoleKey`；`Permission`；限额常量（`USERNAME_MIN_LENGTH` 3、`USERNAME_MAX_LENGTH` 24、`PASSWORD_MIN_LENGTH` 10、`PASSWORD_MAX_LENGTH` 128、`RECOVERY_CODE_COUNT` 10、`RECOVERY_CODE_GROUP_COUNT` 3、`RECOVERY_CODE_GROUP_LENGTH` 4）；`ApiErrorResponse` / `ApiSuccessResponse`；`auth-dto.ts` 中全部契约类型（见 `docs/architecture.md` 与 `HANDOFF.md` 的接口约定）

- [ ] **Step 1: 写失败测试**

`packages/types/src/error-code.spec.ts`：

```ts
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
```

`packages/types/package.json` 的 `scripts` 增加 `"test": "jest"`，`devDependencies` 增加：

```json
{ "@types/jest": "^29.5.13", "jest": "30.5.2", "ts-jest": "^29.2.0" }
```

`packages/types/jest.config.cjs`：

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
};
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace @leximochi/types`
Expected: FAIL，`Cannot find module './error-code'`

- [ ] **Step 3: 实现**

`packages/types/src/error-code.ts`：

```ts
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMITED: 'RATE_LIMITED',
  CAPTCHA_FAILED: 'CAPTCHA_FAILED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_USERNAME_TAKEN: 'AUTH_USERNAME_TAKEN',
  AUTH_ACCOUNT_BANNED: 'AUTH_ACCOUNT_BANNED',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_REUSE_DETECTED: 'AUTH_TOKEN_REUSE_DETECTED',
  AUTH_RECOVERY_CODE_INVALID: 'AUTH_RECOVERY_CODE_INVALID',
  AUTH_SESSION_NOT_FOUND: 'AUTH_SESSION_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const ALL_CODES: ReadonlySet<string> = new Set(Object.values(ErrorCode));

export function isErrorCode(value: string): value is ErrorCode {
  return ALL_CODES.has(value);
}
```

`packages/types/src/permissions.ts`：

```ts
export const RoleKey = { User: 'user', Admin: 'admin' } as const;
export type RoleKey = (typeof RoleKey)[keyof typeof RoleKey];

export const Permission = {
  AdminUsersRead: 'admin.users.read',
  AdminUsersBan: 'admin.users.ban',
  AdminAuditRead: 'admin.audit.read',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];
```

`packages/types/src/limits.ts`：

```ts
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_GROUP_COUNT = 3;
export const RECOVERY_CODE_GROUP_LENGTH = 4;
export const ACCESS_TOKEN_TTL_SECONDS = 900;
export const REFRESH_TOKEN_COOKIE_NAME = 'leximochi_rt';
export const MOBILE_CLIENT_HEADER = 'x-client-type';
```

`packages/types/src/api-error.ts`：

```ts
import type { ErrorCode } from './error-code';

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  requestId: string;
  details?: Record<string, string[]>;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
}

export interface ApiSuccessResponse<T> {
  data: T;
}
```

`packages/types/src/auth-dto.ts`：

```ts
export interface CaptchaChallenge {
  token: string;
  question: string;
  expiresAt: number;
}

export interface PublicUser {
  id: string;
  username: string;
  status: 'active' | 'banned';
  roles: string[];
  createdAt: number;
}

export interface RegisterResponse {
  user: PublicUser;
  recoveryCodes: string[];
}

export interface TokenPair {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}

export interface LoginResponse extends TokenPair {
  user: PublicUser;
}

export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  isCurrent: boolean;
}

export interface RecoveryResponse {
  user: PublicUser;
  recoveryCodes: string[];
}

export interface AdminUserSummary {
  id: string;
  username: string;
  status: 'active' | 'banned';
  roles: string[];
  createdAt: number;
  lastLoginAt: number | null;
}

export interface AdminUserPage {
  items: AdminUserSummary[];
  nextCursor: string | null;
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorType: 'user' | 'admin' | 'system' | 'anonymous';
  action: string;
  targetType: string | null;
  targetId: string | null;
  result: 'success' | 'failure';
  createdAt: number;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  nextCursor: string | null;
}
```

`packages/types/src/index.ts`：

```ts
export * from './api-error';
export * from './auth-dto';
export * from './error-code';
export * from './limits';
export * from './permissions';
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test --workspace @leximochi/types && npm run typecheck --workspace @leximochi/types`
Expected: 3 个用例通过；typecheck 无错误

- [ ] **Step 5: Commit**

```bash
git add packages/types
git commit -m "feat(types): 定义错误码、权限键、限额与认证 DTO 契约"
```

---

# Task 3: packages/core + packages/shared（纯规则与设计 Token）

**Files:**
- Create: `packages/core/src/{username,password,recovery-code,index}.ts`, `packages/core/{package.json,tsconfig.json,jest.config.cjs}`
- Create: `packages/shared/src/{tokens,index}.ts`, `packages/shared/{package.json,tsconfig.json}`
- Test: `packages/core/src/{username,password,recovery-code}.spec.ts`

**Interfaces:**
- Consumes: `@leximochi/types`
- Produces: `normalizeUsername`、`validateUsername`、`ValidationResult`、`validatePassword`、`DEFAULT_PASSWORD_POLICY`、`generateRecoveryCodes`、`normalizeRecoveryCode`、`tokens`

- [ ] **Step 1: 写失败测试**

`packages/core/src/username.spec.ts`：

```ts
import { normalizeUsername, validateUsername } from './username';

describe('normalizeUsername', () => {
  it('去除首尾空白并小写', () => {
    expect(normalizeUsername('  Alice  ')).toBe('alice');
  });

  it('归一化全角字符', () => {
    expect(normalizeUsername('ｂob')).toBe('bob');
  });
});

describe('validateUsername', () => {
  it('接受合法用户名', () => {
    expect(validateUsername('alice_01')).toEqual({ ok: true });
  });

  it('拒绝过短、过长与非法字符', () => {
    expect(validateUsername('ab')).toEqual({ ok: false, reason: 'username_too_short' });
    expect(validateUsername('a'.repeat(25))).toEqual({ ok: false, reason: 'username_too_long' });
    expect(validateUsername('alice!')).toEqual({ ok: false, reason: 'username_invalid_chars' });
  });

  it('拒绝纯数字与保留名', () => {
    expect(validateUsername('123456')).toEqual({ ok: false, reason: 'username_all_digits' });
    expect(validateUsername('admin')).toEqual({ ok: false, reason: 'username_reserved' });
  });
});
```

`packages/core/src/password.spec.ts`：

```ts
import { validatePassword } from './password';

describe('validatePassword', () => {
  it('接受满足策略的密码', () => {
    expect(validatePassword('Str0ng-Passphrase', { username: 'alice' })).toEqual({ ok: true });
  });

  it('拒绝过短与超长密码', () => {
    expect(validatePassword('Short1-a', {})).toEqual({ ok: false, reason: 'password_too_short' });
    expect(validatePassword('a1-'.repeat(60), {})).toEqual({ ok: false, reason: 'password_too_long' });
  });

  it('拒绝字符类别不足的密码', () => {
    expect(validatePassword('aaaaaaaaaaaa', {})).toEqual({
      ok: false,
      reason: 'password_not_complex_enough',
    });
  });

  it('拒绝常见弱密码', () => {
    expect(validatePassword('password1234', {})).toEqual({ ok: false, reason: 'password_too_common' });
  });

  it('拒绝包含用户名的密码', () => {
    expect(validatePassword('Alice-Str0ng', { username: 'alice' })).toEqual({
      ok: false,
      reason: 'password_contains_username',
    });
  });
});
```

`packages/core/src/recovery-code.spec.ts`：

```ts
import { generateRecoveryCodes, normalizeRecoveryCode } from './recovery-code';

const fixedRandom = (size: number): Uint8Array => new Uint8Array(size).fill(7);

describe('generateRecoveryCodes', () => {
  it('按数量生成分组格式的码，且不含易混字符', () => {
    const codes = generateRecoveryCodes({ count: 10, randomBytes: fixedRandom });
    expect(codes).toHaveLength(10);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(code).not.toMatch(/[ILOU]/);
    }
  });

  it('不同随机源产生不同结果', () => {
    let counter = 0;
    const randomBytes = (size: number): Uint8Array => {
      counter += 1;
      return new Uint8Array(size).fill(counter);
    };
    const codes = generateRecoveryCodes({ count: 2, randomBytes });
    expect(codes[0]).not.toBe(codes[1]);
  });
});

describe('normalizeRecoveryCode', () => {
  it('忽略大小写、空格与连字符', () => {
    expect(normalizeRecoveryCode(' abcd-efgh jkmn ')).toBe('ABCDEFGHJKMN');
  });

  it('映射易混字符', () => {
    expect(normalizeRecoveryCode('OOOO-IIII')).toBe('00001111');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run build --workspace @leximochi/types && npm test --workspace @leximochi/core`
Expected: FAIL，`Cannot find module './username'`

- [ ] **Step 3: 实现**

`packages/core/src/username.ts`：

```ts
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@leximochi/types';

export type ValidationResult = { ok: true } | { ok: false; reason: string };

const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'official', 'leximochi', 'moderator',
]);

const ALLOWED_PATTERN = /^[a-z0-9_-]+$/;

export function normalizeUsername(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase();
}

export function validateUsername(raw: string): ValidationResult {
  const value = normalizeUsername(raw);
  if (value.length < USERNAME_MIN_LENGTH) return { ok: false, reason: 'username_too_short' };
  if (value.length > USERNAME_MAX_LENGTH) return { ok: false, reason: 'username_too_long' };
  if (!ALLOWED_PATTERN.test(value)) return { ok: false, reason: 'username_invalid_chars' };
  if (/^[0-9]+$/.test(value)) return { ok: false, reason: 'username_all_digits' };
  if (RESERVED_USERNAMES.has(value)) return { ok: false, reason: 'username_reserved' };
  return { ok: true };
}
```

`packages/core/src/password.ts`：

```ts
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@leximochi/types';
import { normalizeUsername, type ValidationResult } from './username';

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  minCharacterClasses: number;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: PASSWORD_MIN_LENGTH,
  maxLength: PASSWORD_MAX_LENGTH,
  minCharacterClasses: 3,
};

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'password1234', '12345678', '123456789',
  '1234567890', 'qwertyuiop', 'letmein123', 'iloveyou123', 'admin12345', 'welcome123',
]);

function countCharacterClasses(value: string): number {
  let classes = 0;
  if (/[a-z]/.test(value)) classes += 1;
  if (/[A-Z]/.test(value)) classes += 1;
  if (/[0-9]/.test(value)) classes += 1;
  if (/[^A-Za-z0-9]/.test(value)) classes += 1;
  return classes;
}

export function validatePassword(
  password: string,
  ctx: { username?: string },
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): ValidationResult {
  if (password.length < policy.minLength) return { ok: false, reason: 'password_too_short' };
  if (password.length > policy.maxLength) return { ok: false, reason: 'password_too_long' };
  const lowered = password.toLowerCase();
  // 先判常见弱密码：这类密码通常也属于字符类别不足，但「过于常见」对用户更有指导意义
  if (COMMON_PASSWORDS.has(lowered)) return { ok: false, reason: 'password_too_common' };
  if (countCharacterClasses(password) < policy.minCharacterClasses) {
    return { ok: false, reason: 'password_not_complex_enough' };
  }
  if (ctx.username) {
    const canonical = normalizeUsername(ctx.username);
    if (canonical.length >= 3 && lowered.includes(canonical)) {
      return { ok: false, reason: 'password_contains_username' };
    }
  }
  return { ok: true };
}
```

`packages/core/src/recovery-code.ts`：

```ts
import { RECOVERY_CODE_GROUP_COUNT, RECOVERY_CODE_GROUP_LENGTH } from '@leximochi/types';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = RECOVERY_CODE_GROUP_COUNT * RECOVERY_CODE_GROUP_LENGTH;

export function generateRecoveryCodes(options: {
  count: number;
  randomBytes: (size: number) => Uint8Array;
}): string[] {
  const codes: string[] = [];
  for (let i = 0; i < options.count; i += 1) {
    const bytes = options.randomBytes(CODE_LENGTH);
    if (bytes.length < CODE_LENGTH) {
      throw new Error('随机源返回的字节数不足');
    }
    let chars = '';
    for (let j = 0; j < CODE_LENGTH; j += 1) {
      chars += ALPHABET[bytes[j]! % ALPHABET.length];
    }
    const groups: string[] = [];
    for (let g = 0; g < RECOVERY_CODE_GROUP_COUNT; g += 1) {
      groups.push(
        chars.slice(g * RECOVERY_CODE_GROUP_LENGTH, (g + 1) * RECOVERY_CODE_GROUP_LENGTH),
      );
    }
    codes.push(groups.join('-'));
  }
  return codes;
}

export function normalizeRecoveryCode(raw: string): string {
  return raw
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}
```

`packages/core/src/index.ts`：

```ts
export * from './password';
export * from './recovery-code';
export * from './username';
```

`packages/core/package.json`：

```json
{
  "name": "@leximochi/core",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "jest",
    "lint": "eslint src"
  },
  "dependencies": { "@leximochi/types": "*" },
  "devDependencies": {
    "@types/jest": "^29.5.13",
    "jest": "30.5.2",
    "ts-jest": "^29.2.0"
  }
}
```

`packages/core/tsconfig.json` 与 `packages/core/jest.config.cjs` 内容同 `packages/types` 对应文件。

`packages/shared/src/tokens.ts`：

```ts
export const tokens = {
  color: {
    background: '#FFFDF7',
    surface: '#FFFFFF',
    primary: '#FF8A3D',
    primaryDark: '#E06A1F',
    accent: '#4EC5A5',
    textPrimary: '#2B2118',
    textSecondary: '#6B5B4B',
    danger: '#E5484D',
    border: '#EADFD2',
    gold: '#F5C542',
  },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 8, md: 12, lg: 20, pill: 999 },
  fontSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28 },
  duration: { fast: 120, normal: 240, slow: 480 },
} as const;

export type DesignTokens = typeof tokens;
```

`packages/shared/src/index.ts`：`export * from './tokens';`

`packages/shared/package.json`：

```json
{
  "name": "@leximochi/shared",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src"
  }
}
```

> 视觉方向：活泼、现代、适度游戏化（暖橙主色 + 薄荷绿点缀 + 圆润大圆角 + 清晰字号层级）。**禁止**复制多邻国等品牌的角色、素材、文案或界面。

- [ ] **Step 4: 构建依赖并运行测试**

Run: `npm run build --workspace @leximochi/types && npm test --workspace @leximochi/core && npm run typecheck --workspace @leximochi/shared`
Expected: core 的 11 个用例全部通过；shared typecheck 无错误

- [ ] **Step 5: Commit**

```bash
git add packages/core packages/shared package-lock.json
git commit -m "feat(core,shared): 实现用户名/密码/恢复码纯规则与设计 Token"
```

---

# Task 4: 服务端骨架与错误模型

**Files:**
- Create: `apps/server/{package.json,tsconfig.json,tsconfig.build.json,nest-cli.json,jest.config.cjs,jest-e2e.config.cjs}`
- Create: `apps/server/src/main.ts`, `apps/server/src/app.module.ts`, `apps/server/src/config/{configuration.ts,config.provider.ts}`
- Create: `apps/server/src/common/errors/app-error.ts`, `apps/server/src/common/filters/all-exceptions.filter.ts`, `apps/server/src/common/middleware/request-context.middleware.ts`, `apps/server/src/common/guards/csrf-origin.guard.ts`, `apps/server/src/common/decorators/public.decorator.ts`
- Create: `apps/server/src/modules/health/{health.controller.ts,health.module.ts}`
- Test: `apps/server/test/env.schema.spec.ts`, `apps/server/test/health.e2e-spec.ts`, `apps/server/test/helpers/test-env.ts`

**Interfaces:**
- Consumes: `@leximochi/types`
- Produces: `AppError` / `isAppError`；`ServerConfig`；`loadConfig(env): ServerConfig`；`GET /health`；DI token `'CONFIG'`

- [ ] **Step 1: 写失败测试**

`apps/server/test/env.schema.spec.ts`：

```ts
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
```

`apps/server/test/health.e2e-spec.ts`：

```ts
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { buildTestEnv } from './helpers/test-env';

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('CONFIG')
      .useValue(buildTestEnv())
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('返回 200 与 ok 状态', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('未知路由返回统一错误格式且不泄露内部信息', async () => {
    const res = await request(app.getHttpServer()).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(res.body)).not.toMatch(/node_modules|\.ts:|at Object/);
    expect(typeof res.body.error.requestId).toBe('string');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace @leximochi/server`
Expected: FAIL，`Cannot find module '../src/config/configuration'`

- [ ] **Step 3: 实现服务端骨架**

`apps/server/package.json`：

```json
{
  "name": "@leximochi/server",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "jest --runInBand",
    "lint": "eslint src test",
    "db:generate": "drizzle-kit generate",
    "create-admin": "node dist/scripts/create-admin.js"
  },
  "dependencies": {
    "@leximochi/core": "*",
    "@leximochi/types": "*",
    "@nestjs/common": "12.0.4",
    "@nestjs/core": "12.0.4",
    "@nestjs/jwt": "12.0.2",
    "@nestjs/platform-express": "12.0.4",
    "@nestjs/throttler": "6.7.0",
    "@node-rs/argon2": "2.2.1",
    "better-sqlite3": "13.0.3",
    "class-transformer": "0.5.1",
    "class-validator": "0.15.1",
    "cookie-parser": "^1.4.7",
    "drizzle-orm": "0.45.3",
    "helmet": "8.3.0",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.2"
  },
  "devDependencies": {
    "@nestjs/cli": "12.0.3",
    "@nestjs/schematics": "^12.0.0",
    "@nestjs/testing": "12.0.4",
    "@types/better-sqlite3": "^7.6.11",
    "@types/cookie-parser": "^1.4.8",
    "@types/express": "^5.0.0",
    "@types/jest": "^29.5.13",
    "@types/node": "^24.0.0",
    "@types/supertest": "^6.0.2",
    "drizzle-kit": "0.31.11",
    "jest": "30.5.2",
    "supertest": "7.2.2",
    "ts-jest": "^29.2.0",
    "ts-node": "^10.9.2"
  }
}
```

`apps/server/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16",
    "isolatedModules": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "rootDir": ".",
    "outDir": "dist",
    "types": ["node", "jest"],
    "strictPropertyInitialization": false
  },
  "include": ["src", "test"]
}
```

`apps/server/tsconfig.build.json`：

```json
{ "extends": "./tsconfig.json", "exclude": ["node_modules", "test", "dist", "**/*.spec.ts"] }
```

`apps/server/nest-cli.json`：

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true, "tsConfigPath": "tsconfig.build.json" }
}
```

`apps/server/jest.config.cjs`：

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts', '<rootDir>/test/**/*.e2e-spec.ts'],
  testTimeout: 30000,
};
```

`apps/server/src/config/configuration.ts`：

```ts
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
```

`apps/server/src/config/config.provider.ts`：

```ts
import type { Provider } from '@nestjs/common';
import { loadConfig } from './configuration';

export const configProvider: Provider = {
  provide: 'CONFIG',
  useFactory: () => loadConfig(process.env),
};
```

`apps/server/src/common/errors/app-error.ts`：

```ts
import { ErrorCode } from '@leximochi/types';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, string[]>;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus: number,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
```

`apps/server/src/common/filters/all-exceptions.filter.ts`：

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode, type ApiErrorResponse } from '@leximochi/types';
import { AppError } from '../errors/app-error';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = request.requestId ?? 'unknown';

    let status: number;
    let body: ApiErrorResponse;

    if (exception instanceof AppError) {
      status = exception.httpStatus;
      body = {
        error: {
          code: exception.code,
          message: exception.message,
          requestId,
          ...(exception.details ? { details: exception.details } : {}),
        },
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      body = {
        error: {
          code: STATUS_TO_CODE[status] ?? ErrorCode.INTERNAL_ERROR,
          message: Array.isArray(message) ? '请求参数不合法' : String(message),
          requestId,
        },
      };
    } else {
      status = 500;
      body = { error: { code: ErrorCode.INTERNAL_ERROR, message: '服务器内部错误', requestId } };
      this.logger.error(
        `未处理异常 requestId=${requestId} path=${request.url}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }
}
```

`apps/server/src/common/middleware/request-context.middleware.ts`：

```ts
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type RequestWithId = Request & { requestId?: string };

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    const requestId = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  }
}
```

`apps/server/src/common/guards/csrf-origin.guard.ts`：

```ts
import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ErrorCode, REFRESH_TOKEN_COOKIE_NAME } from '@leximochi/types';
import { AppError } from '../errors/app-error';
import type { ServerConfig } from '../../config/configuration';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  constructor(@Inject('CONFIG') private readonly config: ServerConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    // 仅携带会话 Cookie 的请求存在 CSRF 面；移动端通过 Body 传凭证，不受此约束
    const hasSessionCookie = Boolean(
      req.headers.cookie?.includes(`${REFRESH_TOKEN_COOKIE_NAME}=`),
    );
    if (!hasSessionCookie) return true;
    const origin = req.header('origin');
    if (!origin || !this.config.corsOrigins.includes(origin)) {
      throw new AppError(ErrorCode.FORBIDDEN, '请求来源不被允许', 403);
    }
    return true;
  }
}
```

`apps/server/src/common/decorators/public.decorator.ts`：

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

export function Public(): MethodDecorator & ClassDecorator {
  return SetMetadata(IS_PUBLIC_KEY, true);
}
```

`apps/server/src/modules/health/health.controller.ts`：

```ts
import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { data: { status: 'ok'; uptimeSeconds: number } } {
    return { data: { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) } };
  }
}
```

`apps/server/src/modules/health/health.module.ts`：

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
```

`apps/server/src/app.module.ts`：

```ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CsrfOriginGuard } from './common/guards/csrf-origin.guard';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { configProvider } from './config/config.provider';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]), HealthModule],
  providers: [
    configProvider,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfOriginGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
```

`apps/server/src/main.ts`：

```ts
import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    // 只输出变量名与原因，绝不输出秘密值
    logger.error(`配置校验失败: ${error instanceof Error ? error.message : 'unknown'}`);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();
  await app.listen(config.port);
  logger.log(`服务已启动，端口 ${config.port}，环境 ${config.env}`);
}

void bootstrap();
```

`apps/server/test/helpers/test-env.ts`：

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run build --workspace @leximochi/types && npm test --workspace @leximochi/server`
Expected: `env.schema` 6 个用例 + `health.e2e` 2 个用例全部通过

- [ ] **Step 5: 手动验证启动行为**

Run: `cd apps/server && cp ../../.env.example .env && npm run build && node dist/main.js`
另开终端：`curl -i http://localhost:3000/health`
Expected: 200 与 `{"data":{"status":"ok",...}}`；随后把 `.env` 中 `JWT_SECRET` 改为 `short`，重启进程并确认它**以退出码 1 退出**且日志只打印变量名

- [ ] **Step 6: Commit**

```bash
git add apps/server
git commit -m "feat(server): 搭建 NestJS 骨架、启动期配置校验与统一错误模型"
```

---

# Task 5: 数据库层与 migration

**Files:**
- Create: `apps/server/drizzle.config.ts`, `apps/server/drizzle/**`（drizzle-kit 生成）
- Create: `apps/server/src/database/{database.service.ts,database.module.ts,database.constants.ts,migrate.ts}`
- Create: `apps/server/src/database/schema/{users,roles,sessions,recovery-codes,auth-attempts,captcha-challenges,audit-logs,index}.ts`
- Create: `apps/server/src/database/seed/roles.seed.ts`
- Test: `apps/server/test/database.spec.ts`

**Interfaces:**
- Consumes: `ServerConfig.databasePath`
- Produces: `createDatabase(path): DatabaseService`；`DatabaseService{sqlite, db, pragma, withTransaction, close}`；表定义；`runMigrations(db, folder)`；`seedSystemRoles(db)`；DI token `DATABASE`

- [ ] **Step 1: 写失败测试**

`apps/server/test/database.spec.ts`：

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, type DatabaseService } from '../src/database/database.service';
import { runMigrations } from '../src/database/migrate';
import { seedSystemRoles } from '../src/database/seed/roles.seed';

const MIGRATIONS = join(__dirname, '..', 'drizzle');

describe('数据库层', () => {
  let dir: string;
  let db: DatabaseService;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'leximochi-db-'));
    db = createDatabase(join(dir, 'test.sqlite'));
    runMigrations(db, MIGRATIONS);
    seedSystemRoles(db);
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('启用 WAL、busy_timeout 与外键', () => {
    expect(String(db.pragma('journal_mode')).toLowerCase()).toBe('wal');
    expect(Number(db.pragma('busy_timeout'))).toBe(5000);
    expect(Number(db.pragma('foreign_keys'))).toBe(1);
  });

  it('migration 创建全部 Phase 1 表', () => {
    const rows = db.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = rows.map((r) => r.name);
    for (const table of [
      'users', 'roles', 'permissions', 'role_permissions', 'user_roles',
      'sessions', 'recovery_codes', 'auth_attempts', 'captcha_challenges', 'audit_logs',
    ]) {
      expect(names).toContain(table);
    }
  });

  it('migration 与种子数据可重复执行', () => {
    runMigrations(db, MIGRATIONS);
    seedSystemRoles(db);
    const roles = db.sqlite.prepare('SELECT key FROM roles ORDER BY key').all() as Array<{ key: string }>;
    expect(roles.map((r) => r.key)).toEqual(['admin', 'user']);
    const perms = db.sqlite
      .prepare('SELECT key FROM permissions ORDER BY key')
      .all() as Array<{ key: string }>;
    expect(perms.map((p) => p.key)).toEqual([
      'admin.audit.read', 'admin.users.ban', 'admin.users.read',
    ]);
    const links = db.sqlite
      .prepare(
        `SELECT COUNT(*) AS c FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id WHERE r.key = 'admin'`,
      )
      .get() as { c: number };
    expect(links.c).toBe(3);
  });

  it('外键约束生效：插入不存在用户的会话被拒绝', () => {
    expect(() =>
      db.sqlite
        .prepare(
          `INSERT INTO sessions (id, user_id, family_id, refresh_token_hash, expires_at, created_at)
           VALUES ('s1', 'missing-user', 'f1', 'h1', 1, 1)`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/i);
  });

  it('username_canonical 唯一约束生效', () => {
    const now = Date.now();
    const insert = db.sqlite.prepare(
      `INSERT INTO users (id, username, username_canonical, password_hash, password_algo,
         password_updated_at, status, created_at, updated_at)
       VALUES (?, ?, ?, 'hash', 'argon2id', ?, 'active', ?, ?)`,
    );
    insert.run('u1', 'Alice', 'alice', now, now, now);
    expect(() => insert.run('u2', 'alice', 'alice', now, now, now)).toThrow(/UNIQUE/i);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace @leximochi/server`
Expected: FAIL，`Cannot find module '../src/database/database.service'`

- [ ] **Step 3: 实现 schema**

表定义按 `docs/database-design.md` 第 3 节逐字段实现。关键片段：

`apps/server/src/database/schema/users.ts`：

```ts
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    usernameCanonical: text('username_canonical').notNull(),
    passwordHash: text('password_hash').notNull(),
    passwordAlgo: text('password_algo').notNull().default('argon2id'),
    passwordUpdatedAt: integer('password_updated_at').notNull(),
    status: text('status', { enum: ['active', 'banned'] }).notNull().default('active'),
    bannedReason: text('banned_reason'),
    bannedAt: integer('banned_at'),
    bannedBy: text('banned_by').references((): typeof users.id => users.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    lastLoginAt: integer('last_login_at'),
  },
  (table) => [
    uniqueIndex('users_username_canonical_unique').on(table.usernameCanonical),
    index('users_status_idx').on(table.status),
  ],
);
```

`apps/server/src/database/schema/roles.ts`：

```ts
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  isSystem: integer('is_system').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const permissions = sqliteTable('permissions', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  description: text('description'),
  createdAt: integer('created_at').notNull(),
});

export const rolePermissions = sqliteTable(
  'role_permissions',
  {
    roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: text('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const userRoles = sqliteTable(
  'user_roles',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    grantedAt: integer('granted_at').notNull(),
    grantedBy: text('granted_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index('user_roles_role_idx').on(table.roleId),
  ],
);
```

`apps/server/src/database/schema/sessions.ts`：

```ts
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const REVOKE_REASONS = [
  'logout', 'rotated', 'reuse_detected', 'password_changed', 'recovery_used', 'banned', 'logout_all',
] as const;
export type RevokeReason = (typeof REVOKE_REASONS)[number];

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    familyId: text('family_id').notNull(),
    refreshTokenHash: text('refresh_token_hash').notNull().unique(),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
    revokedReason: text('revoked_reason'),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: integer('created_at').notNull(),
    lastUsedAt: integer('last_used_at'),
  },
  (table) => [
    index('sessions_user_idx').on(table.userId),
    index('sessions_family_idx').on(table.familyId),
    index('sessions_expires_idx').on(table.expiresAt),
  ],
);
```

`apps/server/src/database/schema/recovery-codes.ts`：

```ts
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const recoveryCodes = sqliteTable(
  'recovery_codes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    createdAt: integer('created_at').notNull(),
    usedAt: integer('used_at'),
    usedIp: text('used_ip'),
  },
  (table) => [index('recovery_codes_user_idx').on(table.userId, table.usedAt)],
);
```

`apps/server/src/database/schema/auth-attempts.ts`：

```ts
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const ATTEMPT_KINDS = ['login', 'register', 'refresh', 'recovery', 'captcha'] as const;
export type AttemptKind = (typeof ATTEMPT_KINDS)[number];

export const authAttempts = sqliteTable(
  'auth_attempts',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    usernameCanonical: text('username_canonical'),
    ip: text('ip'),
    success: integer('success').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('auth_attempts_user_idx').on(table.kind, table.usernameCanonical, table.createdAt),
    index('auth_attempts_ip_idx').on(table.kind, table.ip, table.createdAt),
    index('auth_attempts_created_idx').on(table.createdAt),
  ],
);
```

`apps/server/src/database/schema/captcha-challenges.ts`：

```ts
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const captchaChallenges = sqliteTable(
  'captcha_challenges',
  {
    jti: text('jti').primaryKey(),
    answerHash: text('answer_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    consumedAt: integer('consumed_at'),
    ip: text('ip'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('captcha_challenges_expires_idx').on(table.expiresAt)],
);
```

`apps/server/src/database/schema/audit-logs.ts`：

```ts
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const ACTOR_TYPES = ['user', 'admin', 'system', 'anonymous'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorType: text('actor_type').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    result: text('result').notNull(),
    metadataJson: text('metadata_json'),
    requestId: text('request_id'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('audit_logs_action_idx').on(table.action, table.createdAt),
    index('audit_logs_actor_idx').on(table.actorUserId, table.createdAt),
    index('audit_logs_target_idx').on(table.targetType, table.targetId, table.createdAt),
  ],
);
```

`apps/server/src/database/schema/index.ts`：

```ts
export * from './audit-logs';
export * from './auth-attempts';
export * from './captcha-challenges';
export * from './recovery-codes';
export * from './roles';
export * from './sessions';
export * from './users';
```

- [ ] **Step 4: 实现连接、迁移与种子**

`apps/server/src/database/database.service.ts`：

```ts
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface DatabaseService {
  readonly sqlite: BetterSqlite3.Database;
  readonly db: DrizzleDb;
  pragma(name: string): unknown;
  withTransaction<T>(fn: (tx: DrizzleDb) => T): T;
  close(): void;
}

export function createDatabase(databasePath: string): DatabaseService {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  const sqlite = new BetterSqlite3(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');

  if (databasePath !== ':memory:') {
    const journalMode = String(sqlite.pragma('journal_mode')).toLowerCase();
    if (journalMode !== 'wal') {
      sqlite.close();
      throw new Error(`SQLite 未能启用 WAL（当前模式: ${journalMode}）`);
    }
  }

  const db = drizzle(sqlite, { schema });
  return {
    sqlite,
    db,
    pragma: (name: string) => sqlite.pragma(name),
    withTransaction: <T>(fn: (tx: DrizzleDb) => T): T => sqlite.transaction(() => fn(db))(),
    close: () => sqlite.close(),
  };
}

export { schema };
```

`apps/server/src/database/migrate.ts`：

```ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { DatabaseService } from './database.service';

export function runMigrations(db: DatabaseService, migrationsFolder: string): void {
  migrate(db.db, { migrationsFolder });
}
```

`apps/server/src/database/seed/roles.seed.ts`：

```ts
import { randomUUID } from 'node:crypto';
import { Permission, RoleKey } from '@leximochi/types';
import { eq } from 'drizzle-orm';
import type { DatabaseService } from '../database.service';
import { permissions, rolePermissions, roles } from '../schema';

const ROLE_DEFINITIONS = [
  { key: RoleKey.User, name: '普通用户', description: '学习与宠物养成的基础身份', permissions: [] as string[] },
  {
    key: RoleKey.Admin,
    name: '管理员',
    description: '管理后台身份',
    permissions: [Permission.AdminUsersRead, Permission.AdminUsersBan, Permission.AdminAuditRead],
  },
] as const;

export function seedSystemRoles(db: DatabaseService): void {
  const now = Date.now();
  db.withTransaction((tx) => {
    for (const role of ROLE_DEFINITIONS) {
      tx.insert(roles)
        .values({
          id: randomUUID(),
          key: role.key,
          name: role.name,
          description: role.description,
          isSystem: 1,
          createdAt: now,
        })
        .onConflictDoNothing({ target: roles.key })
        .run();
    }
    const allPermissionKeys = ROLE_DEFINITIONS.flatMap((role) => [...role.permissions]);
    for (const key of allPermissionKeys) {
      tx.insert(permissions)
        .values({ id: randomUUID(), key, description: key, createdAt: now })
        .onConflictDoNothing({ target: permissions.key })
        .run();
    }
    for (const role of ROLE_DEFINITIONS) {
      const roleRow = tx.select().from(roles).where(eq(roles.key, role.key)).get();
      if (!roleRow) throw new Error(`种子角色缺失: ${role.key}`);
      for (const permissionKey of role.permissions) {
        const permissionRow = tx.select().from(permissions).where(eq(permissions.key, permissionKey)).get();
        if (!permissionRow) throw new Error(`种子权限缺失: ${permissionKey}`);
        tx.insert(rolePermissions)
          .values({ roleId: roleRow.id, permissionId: permissionRow.id })
          .onConflictDoNothing()
          .run();
      }
    }
  });
}
```

`apps/server/src/database/database.constants.ts`：

```ts
export const MIGRATIONS_FOLDER = 'drizzle';
export const DATABASE = 'DATABASE';
```

`apps/server/src/database/database.module.ts`：

```ts
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { ServerConfig } from '../config/configuration';
import { MIGRATIONS_FOLDER, DATABASE } from './database.constants';
import { createDatabase, type DatabaseService } from './database.service';
import { runMigrations } from './migrate';
import { seedSystemRoles } from './seed/roles.seed';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: ['CONFIG'],
      useFactory: (config: ServerConfig): DatabaseService => {
        const db = createDatabase(config.databasePath);
        runMigrations(db, `${__dirname}/../../${MIGRATIONS_FOLDER}`);
        seedSystemRoles(db);
        return db;
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: DatabaseService) {}

  onApplicationShutdown(): void {
    this.db.close();
  }
}
```

`apps/server/drizzle.config.ts`：

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_PATH ?? './data/db/leximochi.sqlite' },
});
```

并在 `apps/server/src/app.module.ts` 的 `imports` 中加入 `DatabaseModule`。

- [ ] **Step 5: 生成迁移并运行测试**

Run: `npm run db:generate --workspace @leximochi/server && npm test --workspace @leximochi/server`
Expected: 生成 `apps/server/drizzle/0000_*.sql` 与 `drizzle/meta/*`；数据库测试 5 个用例通过（含 WAL、外键、唯一约束、重复迁移幂等）

- [ ] **Step 6: 人工复核迁移文件**

打开生成的 SQL 并确认：10 张表齐全、`users_username_canonical_unique` 存在、`sessions.refresh_token_hash` 唯一、外键含 `ON DELETE CASCADE`/`SET NULL`。不符则修正 schema 并重新生成，**不得手改迁移语义**。

- [ ] **Step 7: Commit**

```bash
git add apps/server/drizzle apps/server/drizzle.config.ts apps/server/src/database apps/server/src/app.module.ts package-lock.json
git commit -m "feat(server): 落地 SQLite schema（WAL/外键/事务）、migration 与种子角色"
```

---

# Task 6: 验证码抽象、仓储层与注册

**Files:**
- Create: `apps/server/src/modules/auth/captcha/{captcha.provider.ts,challenge-captcha.provider.ts}`
- Create: `apps/server/src/modules/users/domain/{user.repository.ts,recovery-code.repository.ts,role.repository.ts}`
- Create: `apps/server/src/database/repositories/{drizzle-user.repository.ts,drizzle-recovery-code.repository.ts,drizzle-role.repository.ts}`
- Create: `apps/server/src/modules/audit/{audit.service.ts,audit.module.ts}`, `apps/server/src/database/repositories/drizzle-audit.repository.ts`
- Create: `apps/server/src/modules/auth/{password-hasher.ts,auth.service.ts,auth.controller.ts,auth.module.ts}`, `apps/server/src/modules/auth/dto/{captcha.dto.ts,register.dto.ts}`
- Create: `apps/server/src/modules/users/users.module.ts`
- Test: `apps/server/test/captcha.spec.ts`, `apps/server/test/register.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 5 的 `DATABASE`、`ServerConfig`、`@leximochi/core`
- Produces:
  - `CAPTCHA_PROVIDER` / `CaptchaProvider.issue(ctx)` / `.verify(input)`
  - `USER_REPOSITORY`（`findById`/`findByUsernameCanonical`/`create`/`updatePassword`/`setStatus`/`touchLastLogin`/`listRoles`/`toPublicUser`）
  - `RECOVERY_CODE_REPOSITORY`（`replaceAllForUser`/`consume`/`listUnused`/`countUnused`）
  - `ROLE_REPOSITORY`（`findByKey`/`assignRole`）
  - `AUDIT_REPOSITORY` / `AuditService.record` / `AuditService.list`
  - `POST /auth/captcha`、`POST /auth/register`

- [ ] **Step 1: 写失败测试**

`apps/server/test/captcha.spec.ts`：

```ts
import { ChallengeCaptchaProvider } from '../src/modules/auth/captcha/challenge-captcha.provider';

describe('ChallengeCaptchaProvider', () => {
  const provider = new ChallengeCaptchaProvider({ captchaSecret: 'c'.repeat(40) });

  it('签发挑战并通过正确答案校验', async () => {
    const challenge = await provider.issue({ ip: '127.0.0.1' });
    const answer = provider.solveForTest(challenge.token);
    await expect(provider.verify({ token: challenge.token, answer, ip: '127.0.0.1' })).resolves.toBe(true);
  });

  it('拒绝错误答案', async () => {
    const challenge = await provider.issue({ ip: '127.0.0.1' });
    await expect(provider.verify({ token: challenge.token, answer: '9999', ip: '127.0.0.1' })).resolves.toBe(false);
  });

  it('挑战只能使用一次', async () => {
    const challenge = await provider.issue({ ip: '127.0.0.1' });
    const answer = provider.solveForTest(challenge.token);
    await provider.verify({ token: challenge.token, answer, ip: '127.0.0.1' });
    await expect(provider.verify({ token: challenge.token, answer, ip: '127.0.0.1' })).resolves.toBe(false);
  });

  it('拒绝被篡改的 token', async () => {
    const challenge = await provider.issue({ ip: '127.0.0.1' });
    const tampered = `${challenge.token.slice(0, -2)}xx`;
    await expect(provider.verify({ token: tampered, answer: '0', ip: '127.0.0.1' })).resolves.toBe(false);
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
    await expect(providerWithClock.verify({ token: challenge.token, answer, ip: null })).resolves.toBe(false);
  });
});
```

`apps/server/test/register.e2e-spec.ts`：

```ts
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { buildTestEnv } from './helpers/test-env';
import { ChallengeCaptchaProvider } from '../src/modules/auth/captcha/challenge-captcha.provider';
import { DATABASE } from '../src/database/database.constants';
import { createDatabase, type DatabaseService } from '../src/database/database.service';
import { runMigrations } from '../src/database/migrate';
import { seedSystemRoles } from '../src/database/seed/roles.seed';
import { buildTestApp } from './helpers/test-app';

const MIGRATIONS = `${__dirname}/../drizzle`;

describe('POST /auth/register', () => {
  let app: INestApplication;
  let db: DatabaseService;

  beforeAll(async () => {
    db = createDatabase(':memory:');
    runMigrations(db, MIGRATIONS);
    seedSystemRoles(db);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('CONFIG')
      .useValue(buildTestEnv())
      .overrideProvider(DATABASE)
      .useValue(db)
      .compile();
    app = await buildTestApp(moduleRef);
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  async function captcha(): Promise<{ captchaToken: string; captchaAnswer: string }> {
    const provider = app.get(ChallengeCaptchaProvider);
    const challenge = await provider.issue({ ip: '127.0.0.1' });
    return { captchaToken: challenge.token, captchaAnswer: provider.solveForTest(challenge.token) };
  }

  it('注册成功并一次性返回 10 个恢复码，库中只有哈希', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'alice_01', password: 'Str0ng-Passphrase', ...(await captcha()) });
    expect(res.status).toBe(201);
    expect(res.body.data.user.username).toBe('alice_01');
    expect(res.body.data.user.roles).toEqual(['user']);
    expect(res.body.data.recoveryCodes).toHaveLength(10);

    const rows = db.sqlite
      .prepare('SELECT code_hash FROM recovery_codes WHERE user_id = ?')
      .all(res.body.data.user.id) as Array<{ code_hash: string }>;
    expect(rows).toHaveLength(10);
    for (const code of res.body.data.recoveryCodes) {
      expect(rows.map((r) => r.code_hash)).not.toContain(code);
    }
  });

  it('重复用户名（大小写不同）返回 409', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'Alice_01', password: 'Str0ng-Passphrase', ...(await captcha()) });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('AUTH_USERNAME_TAKEN');
  });

  it('弱密码返回 400 且不创建用户', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'bob_02', password: 'password1234', ...(await captcha()) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const count = db.sqlite
      .prepare("SELECT COUNT(*) AS c FROM users WHERE username_canonical = 'bob_02'")
      .get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('验证码错误返回 400 CAPTCHA_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'carol_03', password: 'Str0ng-Passphrase', ...(await captcha()), captchaAnswer: '9999' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CAPTCHA_FAILED');
  });

  it('未声明的字段被拒绝（DTO 白名单）', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'dave_04', password: 'Str0ng-Passphrase', ...(await captcha()), isAdmin: true });
    expect(res.status).toBe(400);
  });

  it('响应不含密码哈希与内部字段', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'erin_05', password: 'Str0ng-Passphrase', ...(await captcha()) });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|\$argon2/);
  });

  it('注册成功写入审计事件且不含秘密', async () => {
    const rows = db.sqlite
      .prepare("SELECT action, metadata_json FROM audit_logs WHERE action = 'auth.register.succeeded'")
      .all() as Array<{ action: string; metadata_json: string | null }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toMatch(/\$argon2|recoveryCodes/);
  });
});
```

`apps/server/test/helpers/test-app.ts`：

```ts
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

export async function buildTestApp(moduleRef: TestingModule): Promise<INestApplication> {
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return app;
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace @leximochi/server`
Expected: FAIL，`Cannot find module '.../challenge-captcha.provider'`

- [ ] **Step 3: 实现验证码 Provider**

`apps/server/src/modules/auth/captcha/captcha.provider.ts`：

```ts
import type { CaptchaChallenge } from '@leximochi/types';

export const CAPTCHA_PROVIDER = 'CAPTCHA_PROVIDER';

export interface CaptchaProvider {
  issue(ctx: { ip: string | null }): Promise<CaptchaChallenge>;
  verify(input: { token: string; answer: string; ip: string | null }): Promise<boolean>;
}
```

`apps/server/src/modules/auth/captcha/challenge-captcha.provider.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { CaptchaChallenge } from '@leximochi/types';
import type { CaptchaProvider } from './captcha.provider';

const TTL_MS = 120_000;

interface ChallengePayload {
  jti: string;
  answer: number;
  exp: number;
  ip: string | null;
}

@Injectable()
export class ChallengeCaptchaProvider implements CaptchaProvider {
  private readonly consumed = new Set<string>();

  constructor(private readonly options: { captchaSecret: string; now?: () => number }) {}

  async issue(ctx: { ip: string | null }): Promise<CaptchaChallenge> {
    const left = randomInt(10, 99);
    const right = randomInt(10, 99);
    const payload: ChallengePayload = {
      jti: randomUUID(),
      answer: left + right,
      exp: this.now() + TTL_MS,
      ip: ctx.ip,
    };
    return { token: this.sign(payload), question: `${left} + ${right} = ?`, expiresAt: payload.exp };
  }

  async verify(input: { token: string; answer: string; ip: string | null }): Promise<boolean> {
    const payload = this.parse(input.token);
    if (!payload) return false;
    if (payload.exp < this.now()) return false;
    if (this.consumed.has(payload.jti)) return false;
    if (payload.ip !== input.ip) return false;
    const provided = String(input.answer).trim();
    if (!/^[0-9]{1,4}$/.test(provided)) return false;
    this.consumed.add(payload.jti);
    return this.safeEqual(String(payload.answer), String(Number(provided)));
  }

  /** 仅供测试使用，生产代码禁止调用 */
  solveForTest(token: string): string {
    const payload = this.parse(token);
    if (!payload) throw new Error('挑战无效');
    return String(payload.answer);
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  private sign(payload: ChallengePayload): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${body}.${this.hmac(body)}`;
  }

  private parse(token: string): ChallengePayload | null {
    const [body, signature] = token.split('.');
    if (!body || !signature) return null;
    if (!this.safeEqual(this.hmac(body), signature)) return null;
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ChallengePayload;
    } catch {
      return null;
    }
  }

  private hmac(value: string): string {
    return createHmac('sha256', this.options.captchaSecret).update(value).digest('base64url');
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
```

> `consumed` 为进程内集合（Phase 1 单实例足够）。多实例部署须改为使用已建好的 `captcha_challenges` 表，该事项记入 `HANDOFF.md` 技术债。

- [ ] **Step 4: 实现仓储接口与 Drizzle 实现**

`apps/server/src/modules/users/domain/user.repository.ts`：

```ts
import type { PublicUser } from '@leximochi/types';

export const USER_REPOSITORY = 'USER_REPOSITORY';

export interface UserRecord {
  id: string;
  username: string;
  usernameCanonical: string;
  passwordHash: string;
  passwordAlgo: string;
  status: 'active' | 'banned';
  bannedReason: string | null;
  createdAt: number;
  lastLoginAt: number | null;
}

export interface CreateUserInput {
  username: string;
  usernameCanonical: string;
  passwordHash: string;
  now: number;
}

export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByUsernameCanonical(canonical: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
  removeById(id: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string, now: number): Promise<void>;
  setStatus(userId: string, status: 'active' | 'banned', ctx: { reason: string | null; actorId: string | null; now: number }): Promise<void>;
  touchLastLogin(userId: string, now: number): Promise<void>;
  listRoles(userId: string): Promise<string[]>;
  listPermissions(userId: string): Promise<string[]>;
  toPublicUser(record: UserRecord): Promise<PublicUser>;
}
```

`apps/server/src/database/repositories/drizzle-user.repository.ts`：实现上述接口。硬性要求：
1. `create` 用**单条 insert**，捕获 `SQLITE_CONSTRAINT_UNIQUE` → 抛 `AppError(ErrorCode.AUTH_USERNAME_TAKEN, '该用户名已被使用', 409)`，**不得**先查后插。
2. `toPublicUser` 只返回 `{ id, username, status, roles, createdAt }`，**绝不**返回 `passwordHash`。
3. `listRoles` 通过 `user_roles` join `roles`；`listPermissions` 通过 `user_roles → role_permissions → permissions` 去重返回。
4. `removeById` 仅用于注册流程失败补偿，实现为 `DELETE FROM users WHERE id = ?`（外键级联清理）。

`apps/server/src/modules/users/domain/recovery-code.repository.ts`：

```ts
export const RECOVERY_CODE_REPOSITORY = 'RECOVERY_CODE_REPOSITORY';

export interface RecoveryCodeRepository {
  replaceAllForUser(userId: string, codeHashes: string[], now: number): Promise<void>;
  /** 条件更新，影响行数为 1 才表示消费成功 */
  consume(userId: string, codeId: string, now: number, ip: string | null): Promise<boolean>;
  listUnused(userId: string): Promise<Array<{ id: string; codeHash: string }>>;
  countUnused(userId: string): Promise<number>;
}
```

`consume` 必须实现为在**单条 SQL 内完成条件更新**（例如 `UPDATE recovery_codes SET used_at=?, used_ip=? WHERE id=? AND user_id=? AND used_at IS NULL`，使用 `db.sqlite.prepare(...).run(...)` 取 `changes`），返回 `changes === 1`。

`apps/server/src/modules/users/domain/role.repository.ts`：

```ts
export const ROLE_REPOSITORY = 'ROLE_REPOSITORY';

export interface RoleRecord {
  id: string;
  key: string;
}

export interface RoleRepository {
  findByKey(key: string): Promise<RoleRecord | null>;
  assignRole(userId: string, roleId: string, ctx: { grantedBy: string | null; now: number }): Promise<void>;
  canAssignRole(actorUserId: string, roleKey: string): Promise<boolean>;
}
```

- [ ] **Step 5: 实现审计服务**

`apps/server/src/modules/audit/audit.service.ts`：

```ts
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuditLogPage } from '@leximochi/types';

export const AUDIT_REPOSITORY = 'AUDIT_REPOSITORY';

export interface AuditRecordInput {
  actorUserId: string | null;
  actorType: 'user' | 'admin' | 'system' | 'anonymous';
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  result: 'success' | 'failure';
  metadata?: Record<string, string | number | boolean | null>;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditQuery {
  action?: string;
  actorUserId?: string;
  targetId?: string;
  targetType?: string;
  limit: number;
  cursor?: string;
}

export interface AuditRepository {
  insert(input: AuditRecordInput & { id: string; createdAt: number }): Promise<void>;
  list(query: AuditQuery): Promise<AuditLogPage>;
}

@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_REPOSITORY) private readonly repository: AuditRepository) {}

  /** 审计写入失败不得阻断主流程，但必须留下日志（Phase 7 增加告警） */
  async record(input: AuditRecordInput): Promise<void> {
    try {
      await this.repository.insert({ ...input, id: randomUUID(), createdAt: Date.now() });
    } catch {
      // 有意吞掉异常，避免审计故障影响业务可用性
    }
  }

  list(query: AuditQuery): Promise<AuditLogPage> {
    return this.repository.list(query);
  }
}
```

`metadata` 中**禁止**出现密码、恢复码、Token、API Key、Cookie 或完整请求体。`drizzle-audit.repository.ts` 把 `metadata` 序列化为 JSON 存入 `metadata_json`，列表查询按 `createdAt` 倒序 + `id` 倒序游标分页。

- [ ] **Step 6: 实现注册流程**

`apps/server/src/modules/auth/password-hasher.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  verify(hashedPassword: string, password: string): Promise<boolean> {
    return verify(hashedPassword, password);
  }
}
```

`apps/server/src/modules/auth/dto/captcha.dto.ts`：

```ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CaptchaAnswerDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  captchaToken!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8)
  captchaAnswer!: string;
}
```

`apps/server/src/modules/auth/dto/register.dto.ts`：

```ts
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@leximochi/types';
import { CaptchaAnswerDto } from './captcha.dto';

export class RegisterDto extends CaptchaAnswerDto {
  @IsString()
  @MinLength(USERNAME_MIN_LENGTH)
  @MaxLength(USERNAME_MAX_LENGTH)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
```

`apps/server/src/modules/auth/auth.service.ts`（注册与验证码签发）：

```ts
import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  generateRecoveryCodes,
  normalizeUsername,
  validatePassword,
  validateUsername,
} from '@leximochi/core';
import { ErrorCode, RoleKey, type CaptchaChallenge, type RegisterResponse } from '@leximochi/types';
import { AppError } from '../../common/errors/app-error';
import type { ServerConfig } from '../../config/configuration';
import { AuditService } from '../audit/audit.service';
import { RECOVERY_CODE_REPOSITORY, type RecoveryCodeRepository } from '../users/domain/recovery-code.repository';
import { ROLE_REPOSITORY, type RoleRepository } from '../users/domain/role.repository';
import { USER_REPOSITORY, type UserRepository } from '../users/domain/user.repository';
import { CAPTCHA_PROVIDER, type CaptchaProvider } from './captcha/captcha.provider';
import { PasswordHasher } from './password-hasher';

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject('CONFIG') private readonly config: ServerConfig,
    @Inject(CAPTCHA_PROVIDER) private readonly captcha: CaptchaProvider,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(RECOVERY_CODE_REPOSITORY) private readonly recoveryCodes: RecoveryCodeRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuditService,
  ) {}

  issueCaptcha(ctx: RequestContext): Promise<CaptchaChallenge> {
    return this.captcha.issue({ ip: ctx.ip });
  }

  async register(
    input: { username: string; password: string; captchaToken: string; captchaAnswer: string },
    ctx: RequestContext,
  ): Promise<RegisterResponse> {
    const usernameCheck = validateUsername(input.username);
    if (!usernameCheck.ok) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, '用户名不符合要求', 400, {
        username: [usernameCheck.reason],
      });
    }
    const passwordCheck = validatePassword(input.password, { username: input.username });
    if (!passwordCheck.ok) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, '密码不符合要求', 400, {
        password: [passwordCheck.reason],
      });
    }
    const captchaOk = await this.captcha.verify({
      token: input.captchaToken,
      answer: input.captchaAnswer,
      ip: ctx.ip,
    });
    if (!captchaOk) {
      await this.audit.record({
        actorUserId: null,
        actorType: 'anonymous',
        action: 'auth.register.failed',
        result: 'failure',
        metadata: { reason: 'captcha_failed' },
        ...ctx,
      });
      throw new AppError(ErrorCode.CAPTCHA_FAILED, '人机验证失败，请重试', 400);
    }

    const userRole = await this.roles.findByKey(RoleKey.User);
    if (!userRole) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, '系统角色缺失', 500);
    }

    const now = Date.now();
    const passwordHash = await this.hasher.hash(input.password);
    const user = await this.users.create({
      username: input.username.trim(),
      usernameCanonical: normalizeUsername(input.username),
      passwordHash,
      now,
    });

    try {
      await this.roles.assignRole(user.id, userRole.id, { grantedBy: null, now });
      const plainCodes = generateRecoveryCodes({
        count: this.config.recoveryCodeCount,
        randomBytes,
      });
      const codeHashes = await Promise.all(plainCodes.map((code) => this.hasher.hash(code)));
      await this.recoveryCodes.replaceAllForUser(user.id, codeHashes, now);
      await this.audit.record({
        actorUserId: user.id,
        actorType: 'user',
        action: 'auth.register.succeeded',
        targetType: 'user',
        targetId: user.id,
        result: 'success',
        ...ctx,
      });
      return { user: await this.users.toPublicUser(user), recoveryCodes: plainCodes };
    } catch (error) {
      // 补偿：注册中途失败时删除已创建用户，避免留下无角色/无恢复码的残缺账号
      await this.users.removeById(user.id);
      await this.audit.record({
        actorUserId: null,
        actorType: 'system',
        action: 'auth.register.rolled_back',
        targetType: 'user',
        targetId: user.id,
        result: 'failure',
        ...ctx,
      });
      throw error;
    }
  }
}
```

`apps/server/src/modules/auth/auth.controller.ts`：

```ts
import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { CaptchaChallenge, RegisterResponse } from '@leximochi/types';
import { Public } from '../../common/decorators/public.decorator';
import type { RequestWithId } from '../../common/middleware/request-context.middleware';
import { AuthService, type RequestContext } from './auth.service';
import { RegisterDto } from './dto/register.dto';

function toContext(req: RequestWithId): RequestContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.header('user-agent') ?? null,
    requestId: req.requestId ?? null,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('captcha')
  @HttpCode(200)
  async captcha(@Req() req: RequestWithId): Promise<{ data: CaptchaChallenge }> {
    return { data: await this.auth.issueCaptcha(toContext(req)) };
  }

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: RequestWithId,
  ): Promise<{ data: RegisterResponse }> {
    return { data: await this.auth.register(dto, toContext(req)) };
  }
}
```

`apps/server/src/modules/auth/auth.module.ts`：绑定全部 DI token（`CAPTCHA_PROVIDER` → `ChallengeCaptchaProvider`，`USER_REPOSITORY`/`RECOVERY_CODE_REPOSITORY`/`ROLE_REPOSITORY` → Drizzle 实现），引入 `UsersModule`（导出仓储 provider）与全局 `AuditModule`。同时在 `AppModule` 中引入 `AuthModule`。

- [ ] **Step 7: 运行测试确认通过**

Run: `npm run build --workspaces --if-present && npm test --workspace @leximochi/server`
Expected: `captcha` 5 个用例、`register.e2e` 7 个用例全部通过

- [ ] **Step 8: Commit**

```bash
git add apps/server/src apps/server/test
git commit -m "feat(auth): 实现 CaptchaProvider 抽象、仓储层与用户注册（Argon2id + 一次性恢复码）"
```

---

# Task 7: 登录与 Token 生命周期

**Files:**
- Create: `apps/server/src/database/repositories/drizzle-session.repository.ts`, `apps/server/src/modules/auth/domain/session.repository.ts`
- Create: `apps/server/src/modules/auth/token.service.ts`, `apps/server/src/common/guards/jwt-auth.guard.ts`, `apps/server/src/common/decorators/{current-user.decorator.ts,require-permissions.decorator.ts}`
- Create: `apps/server/src/modules/auth/dto/{login.dto.ts,refresh.dto.ts}`
- Modify: `apps/server/src/modules/auth/{auth.service.ts,auth.controller.ts,auth.module.ts}`
- Test: `apps/server/test/token.service.spec.ts`, `apps/server/test/login.e2e-spec.ts`, `apps/server/test/session.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 6 全部依赖 + `sessions` 表
- Produces:
  - `TokenService.signAccessToken({userId, sessionId, roles}): Promise<string>`、`verifyAccessToken(token): Promise<AccessTokenPayload>`
  - `TokenService.createRefreshToken(): { token: string; hash: string }`、`hashRefreshToken(token): string`
  - `SessionRepository`（`create`/`findByRefreshHash`/`revoke`/`revokeFamily`/`revokeAllForUser`/`listActive`/`touch`）
  - `JwtAuthGuard`、`@CurrentUser()`、`AuthenticatedUser { userId, sessionId, roles, permissions }`
  - `POST /auth/login`、`POST /auth/refresh`、`POST /auth/logout`、`POST /auth/logout-all`、`GET /auth/me`、`GET /auth/sessions`、`DELETE /auth/sessions/:id`

- [ ] **Step 1: 写失败测试**

`apps/server/test/token.service.spec.ts`：

```ts
import { TokenService } from '../src/modules/auth/token.service';

describe('TokenService', () => {
  const service = new TokenService({
    jwtSecret: 'j'.repeat(40),
    refreshTokenSecret: 'r'.repeat(40),
    accessTokenTtlSeconds: 900,
    refreshTokenTtlDays: 30,
  });

  it('签发并校验 access token', async () => {
    const token = await service.signAccessToken({ userId: 'u1', sessionId: 's1', roles: ['user'] });
    const payload = await service.verifyAccessToken(token);
    expect(payload.sub).toBe('u1');
    expect(payload.sid).toBe('s1');
    expect(payload.roles).toEqual(['user']);
  });

  it('access token 过期后校验失败', async () => {
    const shortLived = new TokenService({
      jwtSecret: 'j'.repeat(40),
      refreshTokenSecret: 'r'.repeat(40),
      accessTokenTtlSeconds: 60,
      refreshTokenTtlDays: 30,
      now: () => Date.now() - 3_600_000,
    });
    const token = await shortLived.signAccessToken({ userId: 'u1', sessionId: 's1', roles: [] });
    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('被篡改的 access token 校验失败', async () => {
    const token = await service.signAccessToken({ userId: 'u1', sessionId: 's1', roles: [] });
    await expect(service.verifyAccessToken(`${token}x`)).rejects.toThrow();
  });

  it('refresh token 为高熵随机串，哈希稳定且不可由哈希反推', () => {
    const first = service.createRefreshToken();
    const second = service.createRefreshToken();
    expect(first.token).not.toBe(second.token);
    expect(first.token.length).toBeGreaterThanOrEqual(43);
    expect(service.hashRefreshToken(first.token)).toBe(first.hash);
    expect(first.hash).not.toContain(first.token);
  });
});
```

`apps/server/test/login.e2e-spec.ts`：

```ts
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { buildTestEnv } from './helpers/test-env';
import { buildTestApp } from './helpers/test-app';
import { DATABASE } from '../src/database/database.constants';
import { createDatabase, type DatabaseService } from '../src/database/database.service';
import { runMigrations } from '../src/database/migrate';
import { seedSystemRoles } from '../src/database/seed/roles.seed';
import { ChallengeCaptchaProvider } from '../src/modules/auth/captcha/challenge-captcha.provider';

const MIGRATIONS = `${__dirname}/../drizzle`;

describe('登录与 Token 生命周期', () => {
  let app: INestApplication;
  let db: DatabaseService;

  beforeAll(async () => {
    db = createDatabase(':memory:');
    runMigrations(db, MIGRATIONS);
    seedSystemRoles(db);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('CONFIG')
      .useValue(buildTestEnv())
      .overrideProvider(DATABASE)
      .useValue(db)
      .compile();
    app = await buildTestApp(moduleRef);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'alice_01', password: 'Str0ng-Passphrase', ...(await captcha()) });
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  async function captcha(): Promise<{ captchaToken: string; captchaAnswer: string }> {
    const provider = app.get(ChallengeCaptchaProvider);
    const challenge = await provider.issue({ ip: '127.0.0.1' });
    return { captchaToken: challenge.token, captchaAnswer: provider.solveForTest(challenge.token) };
  }

  async function login(username = 'alice_01', password = 'Str0ng-Passphrase') {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username, password });
    return res;
  }

  it('登录成功返回 access 与 refresh token', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');
    expect(res.body.data.user.username).toBe('alice_01');
  });

  it('密码错误返回统一错误码，且不区分用户是否存在', async () => {
    const wrongPassword = await login('alice_01', 'Wr0ng-Passphrase!');
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');

    const unknownUser = await login('not_exists_99', 'Wr0ng-Passphrase!');
    expect(unknownUser.status).toBe(401);
    expect(unknownUser.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('refresh 轮换：旧 token 立即失效并触发复用检测', async () => {
    const first = await login();
    const oldRefresh = first.body.data.refreshToken;

    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: oldRefresh });
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.refreshToken).not.toBe(oldRefresh);

    // 旧 refresh token 再次使用 → 复用检测，撤销整个会话族
    const reused = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: oldRefresh });
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('AUTH_TOKEN_REUSE_DETECTED');

    // 轮换后的新 token 也已被族撤销
    const afterReuse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: rotated.body.data.refreshToken });
    expect(afterReuse.status).toBe(401);
  });

  it('缺少 access token 访问受保护接口返回 401', async () => {
    const res = await request(app.getHttpServer()).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('登出后该会话的 refresh token 失效', async () => {
    const session = await login();
    const access = session.body.data.accessToken;
    const refresh = session.body.data.refreshToken;

    const me = await request(app.getHttpServer()).get('/auth/me').set('authorization', `Bearer ${access}`);
    expect(me.status).toBe(200);

    const logout = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('x-client-type', 'mobile')
      .set('authorization', `Bearer ${access}`)
      .send({ refreshToken: refresh });
    expect(logout.status).toBe(200);

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: refresh });
    expect(refreshed.status).toBe(401);
  });

  it('封禁用户无法登录', async () => {
    const now = Date.now();
    db.sqlite.prepare("UPDATE users SET status='banned', banned_reason='test' WHERE username_canonical='alice_01'").run();
    const res = await login();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_ACCOUNT_BANNED');
    db.sqlite.prepare("UPDATE users SET status='active', banned_reason=NULL WHERE username_canonical='alice_01'").run();
    expect(now).toBeGreaterThan(0);
  });
});
```

`apps/server/test/session.e2e-spec.ts`：登录后调用 `GET /auth/sessions` 断言返回当前会话且 `isCurrent=true`；再登录第二个会话，断言列表为 2；用第一个用户会话调用 `DELETE /auth/sessions/:id` 删除**他人**会话 ID 时应返回 404（IDOR 防护）；删除自己的会话后 `GET /auth/sessions` 只返回 1 条。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace @leximochi/server`
Expected: FAIL，`Cannot find module '../src/modules/auth/token.service'`

- [ ] **Step 3: 实现 TokenService**

`apps/server/src/modules/auth/token.service.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  roles: string[];
  iat: number;
  exp: number;
}

export interface TokenServiceOptions {
  jwtSecret: string;
  refreshTokenSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  now?: () => number;
}

@Injectable()
export class TokenService {
  private readonly jwt: JwtService;
  private readonly options: TokenServiceOptions;

  constructor(options: TokenServiceOptions) {
    this.options = options;
    this.jwt = new JwtService({
      secret: options.jwtSecret,
      signOptions: { expiresIn: options.accessTokenTtlSeconds },
    });
  }

  signAccessToken(input: { userId: string; sessionId: string; roles: string[] }): Promise<string> {
    return this.jwt.signAsync({ sub: input.userId, sid: input.sessionId, roles: input.roles });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return (await this.jwt.verifyAsync(token)) as AccessTokenPayload;
  }

  createRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHmac('sha256', this.options.refreshTokenSecret).update(token).digest('hex');
  }

  safeHashEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  refreshTokenExpiry(now: number = this.now()): number {
    return now + this.options.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
  }

  accessTokenTtlSeconds(): number {
    return this.options.accessTokenTtlSeconds;
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }
}
```

- [ ] **Step 4: 实现会话仓储**

`apps/server/src/modules/auth/domain/session.repository.ts`：

```ts
export const SESSION_REPOSITORY = 'SESSION_REPOSITORY';

export interface SessionRecord {
  id: string;
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: number;
  revokedAt: number | null;
  revokedReason: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface CreateSessionInput {
  id: string;
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: number;
  userAgent: string | null;
  ip: string | null;
  now: number;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<void>;
  findById(id: string): Promise<SessionRecord | null>;
  findByRefreshHash(hash: string): Promise<SessionRecord | null>;
  touch(sessionId: string, now: number): Promise<void>;
  /** 条件撤销：仅当未撤销时生效，返回是否成功 */
  revoke(sessionId: string, reason: string, now: number): Promise<boolean>;
  revokeFamily(familyId: string, reason: string, now: number): Promise<void>;
  revokeAllForUser(userId: string, reason: string, now: number): Promise<void>;
  listActive(userId: string): Promise<SessionRecord[]>;
}
```

`revoke` 必须实现为条件更新：`UPDATE sessions SET revoked_at=?, revoked_reason=? WHERE id=? AND revoked_at IS NULL`，返回 `changes === 1`。

- [ ] **Step 5: 实现登录、刷新、登出与会话管理**

在 `AuthService` 中追加（保留 Task 6 的注册逻辑）：

```ts
  async login(
    input: { username: string; password: string },
    ctx: RequestContext,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; user: PublicUser }> {
    const canonical = normalizeUsername(input.username);
    const user = await this.users.findByUsernameCanonical(canonical);

    // 用户不存在时也执行一次哈希校验，避免通过响应时间枚举账号
    if (!user) {
      await this.hasher.verify(DUMMY_ARGON2_HASH, input.password);
      await this.recordLoginFailure(canonical, ctx);
      throw new AppError(ErrorCode.AUTH_INVALID_CREDENTIALS, '用户名或密码不正确', 401);
    }
    if (user.status === 'banned') {
      throw new AppError(ErrorCode.AUTH_ACCOUNT_BANNED, '账号已被封禁', 403);
    }
    const passwordOk = await this.hasher.verify(user.passwordHash, input.password);
    if (!passwordOk) {
      await this.recordLoginFailure(canonical, ctx);
      throw new AppError(ErrorCode.AUTH_INVALID_CREDENTIALS, '用户名或密码不正确', 401);
    }

    const now = Date.now();
    const roles = await this.users.listRoles(user.id);
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const refresh = this.tokens.createRefreshToken();
    await this.sessions.create({
      id: sessionId,
      userId: user.id,
      familyId,
      refreshTokenHash: refresh.hash,
      expiresAt: this.tokens.refreshTokenExpiry(now),
      userAgent: ctx.userAgent,
      ip: ctx.ip,
      now,
    });
    await this.users.touchLastLogin(user.id, now);
    await this.audit.record({
      actorUserId: user.id,
      actorType: 'user',
      action: 'auth.login.succeeded',
      targetType: 'user',
      targetId: user.id,
      result: 'success',
      ...ctx,
    });

    return {
      accessToken: await this.tokens.signAccessToken({ userId: user.id, sessionId, roles }),
      refreshToken: refresh.token,
      expiresIn: this.tokens.accessTokenTtlSeconds(),
      user: await this.users.toPublicUser(user),
    };
  }

  async refresh(input: { refreshToken: string }, ctx: RequestContext): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const hash = this.tokens.hashRefreshToken(input.refreshToken);
    const session = await this.sessions.findByRefreshHash(hash);
    if (!session) {
      throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, '登录状态无效，请重新登录', 401);
    }
    if (session.revokedAt !== null) {
      await this.sessions.revokeFamily(session.familyId, 'reuse_detected', Date.now());
      await this.audit.record({
        actorUserId: session.userId,
        actorType: 'user',
        action: 'auth.token.reuse_detected',
        targetType: 'session',
        targetId: session.id,
        result: 'failure',
        ...ctx,
      });
      throw new AppError(ErrorCode.AUTH_TOKEN_REUSE_DETECTED, '登录状态异常，已登出全部设备', 401);
    }
    const now = Date.now();
    if (session.expiresAt <= now) {
      throw new AppError(ErrorCode.AUTH_TOKEN_EXPIRED, '登录已过期，请重新登录', 401);
    }
    const user = await this.users.findById(session.userId);
    if (!user || user.status === 'banned') {
      await this.sessions.revokeAllForUser(session.userId, 'banned', now);
      throw new AppError(ErrorCode.AUTH_ACCOUNT_BANNED, '账号不可用', 403);
    }

    const rotated = this.tokens.createRefreshToken();
    await this.sessions.revoke(session.id, 'rotated', now);
    await this.sessions.create({
      id: randomUUID(),
      userId: user.id,
      familyId: session.familyId,
      refreshTokenHash: rotated.hash,
      expiresAt: this.tokens.refreshTokenExpiry(now),
      userAgent: ctx.userAgent,
      ip: ctx.ip,
      now,
    });
    const roles = await this.users.listRoles(user.id);
    return {
      accessToken: await this.tokens.signAccessToken({ userId: user.id, sessionId: session.id, roles }),
      refreshToken: rotated.token,
      expiresIn: this.tokens.accessTokenTtlSeconds(),
    };
  }
```

配套实现要求：
- `DUMMY_ARGON2_HASH` 为模块加载时**一次性生成**的固定 Argon2id 哈希常量（用于时序对齐），不得每次请求重新哈希。
- `recordLoginFailure` 写入 `auth_attempts`（`kind='login'`、`success=0`）并写 `auth.login.failed` 审计；Task 9 会在其基础上加入锁定判断。
- `logout(sessionId, refreshToken?)`：校验 refresh token 属于该会话后用 `revoke(..., 'logout')`；`logoutAll(userId)`：`revokeAllForUser(userId, 'logout_all')`。
- `listSessions(userId, currentSessionId)`：返回 `SessionSummary[]`，仅本人会话。
- `deleteSession(userId, sessionId)`：**先按 `id + userId` 条件查找**，找不到返回 `AppError(ErrorCode.AUTH_SESSION_NOT_FOUND, '会话不存在', 404)`（他人会话同样返回 404，避免泄露存在性）。

`apps/server/src/modules/auth/auth.controller.ts` 追加端点：

```ts
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: RequestWithId, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto, toContext(req));
    return { data: this.withRefreshTransport(result, req, res) };
  }
```

`withRefreshTransport` 契约（`auth.controller.ts` 内的私有方法）：
- 若请求头 `x-client-type: mobile` → 响应体包含 `refreshToken`，且**不**下发 Cookie；
- 否则 → 响应体**不含** `refreshToken`，改为 `res.cookie(REFRESH_TOKEN_COOKIE_NAME, token, { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/auth', maxAge })`。
- `refresh` 同样遵循该规则读取凭证：优先 Body，其次 Cookie。
- 该请求头**只影响凭证传输方式**，不授予任何权限。

`apps/server/src/common/guards/jwt-auth.guard.ts`：

```ts
import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@leximochi/types';
import type { Request } from 'express';
import { AppError } from '../errors/app-error';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SESSION_REPOSITORY, type SessionRepository } from '../../modules/auth/domain/session.repository';
import { TokenService } from '../../modules/auth/token.service';
import { USER_REPOSITORY, type UserRepository } from '../../modules/users/domain/user.repository';

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      if (isPublic) return true;
      throw new AppError(ErrorCode.UNAUTHORIZED, '需要登录', 401);
    }

    const payload = await this.tokens.verifyAccessToken(token).catch(() => null);
    if (!payload) {
      throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, '登录状态无效', 401);
    }
    const session = await this.sessions.findById(payload.sid);
    if (!session || session.revokedAt !== null || session.expiresAt <= Date.now()) {
      throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, '登录状态无效', 401);
    }
    const user = await this.users.findById(payload.sub);
    if (!user || user.status === 'banned') {
      throw new AppError(ErrorCode.AUTH_ACCOUNT_BANNED, '账号不可用', 403);
    }

    req.user = {
      userId: user.id,
      sessionId: session.id,
      roles: await this.users.listRoles(user.id),
      permissions: await this.users.listPermissions(user.id),
    };
    return true;
  }
}
```

> 权限每次请求从数据库读取（而非信任 token 中的 `roles`），确保封禁/降权**立即生效**。`@Public()` 的接口即使携带无效 token 也不报错。

`apps/server/src/common/decorators/current-user.decorator.ts`：

```ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../guards/jwt-auth.guard';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user) throw new Error('CurrentUser 只能用于已认证的请求');
    return req.user;
  },
);
```

在 `AppModule` 中把 `JwtAuthGuard` 注册为**全局守卫**（在 `CsrfOriginGuard` 之后），并把 `TokenService`、`SessionRepository` 等 provider 放入 `AuthModule` 并导出，供守卫注入。

- [ ] **Step 6: 运行测试确认通过**

Run: `npm test --workspace @leximochi/server`
Expected: `token.service` 4 个用例、`login.e2e` 6 个用例、`session.e2e` 4 个用例全部通过

- [ ] **Step 7: Commit**

```bash
git add apps/server/src apps/server/test
git commit -m "feat(auth): 实现登录、Access/Refresh 轮换与复用检测、设备会话管理"
```

---

# Task 8: 恢复码流程

**Files:**
- Create: `apps/server/src/modules/auth/dto/recovery.dto.ts`
- Modify: `apps/server/src/modules/auth/{auth.service.ts,auth.controller.ts}`
- Test: `apps/server/test/recovery.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 6/7 全部依赖
- Produces: `POST /auth/recovery` → `{ data: RecoveryResponse }`（返回新密码生效后的用户与**新的一组**恢复码）

- [ ] **Step 1: 写失败测试**

`apps/server/test/recovery.e2e-spec.ts`：

```ts
// 装配方式同 login.e2e-spec.ts
describe('POST /auth/recovery', () => {
  it('使用恢复码重置密码成功，返回新的恢复码组', async () => {
    const registered = await registerUser('frank_06', 'Str0ng-Passphrase');
    const codes = registered.recoveryCodes;

    const res = await request(app.getHttpServer())
      .post('/auth/recovery')
      .send({
        username: 'frank_06',
        recoveryCode: codes[0],
        newPassword: 'N3w-Passphrase!',
        ...(await captcha()),
      });
    expect(res.status).toBe(200);
    expect(res.body.data.recoveryCodes).toHaveLength(10);
    // 新恢复码与旧恢复码不同
    expect(res.body.data.recoveryCodes).not.toEqual(codes);

    // 新密码可登录
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username: 'frank_06', password: 'N3w-Passphrase!' });
    expect(loginRes.status).toBe(200);

    // 旧密码不可登录
    const oldLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username: 'frank_06', password: 'Str0ng-Passphrase' });
    expect(oldLogin.status).toBe(401);
  });

  it('同一个恢复码只能用一次', async () => {
    const registered = await registerUser('gina_07', 'Str0ng-Passphrase');
    const code = registered.recoveryCodes[0];

    const first = await request(app.getHttpServer())
      .post('/auth/recovery')
      .send({ username: 'gina_07', recoveryCode: code, newPassword: 'An0ther-Passphrase!', ...(await captcha()) });
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .post('/auth/recovery')
      .send({ username: 'gina_07', recoveryCode: code, newPassword: 'Th1rd-Passphrase!', ...(await captcha()) });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('AUTH_RECOVERY_CODE_INVALID');
  });

  it('恢复码大小写与连字符不影响识别', async () => {
    const registered = await registerUser('hank_08', 'Str0ng-Passphrase');
    const messy = ` ${registered.recoveryCodes[1]!.toLowerCase()} `;
    const res = await request(app.getHttpServer())
      .post('/auth/recovery')
      .send({ username: 'hank_08', recoveryCode: messy, newPassword: 'N3w-Passphrase!', ...(await captcha()) });
    expect(res.status).toBe(200);
  });

  it('无效恢复码返回统一错误码，且不泄露用户是否存在', async () => {
    await registerUser('iris_09', 'Str0ng-Passphrase');
    const existingUser = await request(app.getHttpServer())
      .post('/auth/recovery')
      .send({ username: 'iris_09', recoveryCode: 'ZZZZ-ZZZZ-ZZZZ', newPassword: 'N3w-Passphrase!', ...(await captcha()) });
    const unknownUser = await request(app.getHttpServer())
      .post('/auth/recovery')
      .send({ username: 'nobody_10', recoveryCode: 'ZZZZ-ZZZZ-ZZZZ', newPassword: 'N3w-Passphrase!', ...(await captcha()) });
    expect(existingUser.status).toBe(400);
    expect(unknownUser.status).toBe(400);
    expect(existingUser.body.error.code).toBe('AUTH_RECOVERY_CODE_INVALID');
    expect(unknownUser.body.error.code).toBe('AUTH_RECOVERY_CODE_INVALID');
  });

  it('使用恢复码后撤销该用户全部会话', async () => {
    const registered = await registerUser('jack_11', 'Str0ng-Passphrase');
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username: 'jack_11', password: 'Str0ng-Passphrase' });
    const oldRefresh = loginRes.body.data.refreshToken;

    await request(app.getHttpServer())
      .post('/auth/recovery')
      .send({ username: 'jack_11', recoveryCode: registered.recoveryCodes[0], newPassword: 'N3w-Passphrase!', ...(await captcha()) });

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: oldRefresh });
    expect(refreshed.status).toBe(401);
  });

  it('弱新密码被拒绝且不消耗恢复码', async () => {
    const registered = await registerUser('kate_12', 'Str0ng-Passphrase');
    const code = registered.recoveryCodes[0];
    const weak = await request(app.getHttpServer())
      .post('/auth/recovery')
      .send({ username: 'kate_12', recoveryCode: code, newPassword: 'password1234', ...(await captcha()) });
    expect(weak.status).toBe(400);

    const retry = await request(app.getHttpServer())
      .post('/auth/recovery')
      .send({ username: 'kate_12', recoveryCode: code, newPassword: 'N3w-Passphrase!', ...(await captcha()) });
    expect(retry.status).toBe(200);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace @leximochi/server`
Expected: FAIL，`POST /auth/recovery` 返回 404

- [ ] **Step 3: 实现**

`apps/server/src/modules/auth/dto/recovery.dto.ts`：

```ts
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@leximochi/types';
import { CaptchaAnswerDto } from './captcha.dto';

export class RecoveryDto extends CaptchaAnswerDto {
  @IsString()
  @MinLength(USERNAME_MIN_LENGTH)
  @MaxLength(USERNAME_MAX_LENGTH)
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  recoveryCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword!: string;
}
```

`AuthService.recover`（追加到 `auth.service.ts`）：

```ts
  async recover(
    input: { username: string; recoveryCode: string; newPassword: string; captchaToken: string; captchaAnswer: string },
    ctx: RequestContext,
  ): Promise<RecoveryResponse> {
    const captchaOk = await this.captcha.verify({
      token: input.captchaToken,
      answer: input.captchaAnswer,
      ip: ctx.ip,
    });
    if (!captchaOk) {
      throw new AppError(ErrorCode.CAPTCHA_FAILED, '人机验证失败，请重试', 400);
    }

    const passwordCheck = validatePassword(input.newPassword, { username: input.username });
    if (!passwordCheck.ok) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, '新密码不符合要求', 400, {
        newPassword: [passwordCheck.reason],
      });
    }

    const invalid = new AppError(ErrorCode.AUTH_RECOVERY_CODE_INVALID, '恢复码无效或已使用', 400);
    const user = await this.users.findByUsernameCanonical(normalizeUsername(input.username));
    if (!user) {
      // 时序对齐：对固定假哈希做一次校验，避免通过响应时间枚举用户
      await this.hasher.verify(DUMMY_ARGON2_HASH, input.newPassword);
      throw invalid;
    }

    const normalizedCode = normalizeRecoveryCode(input.recoveryCode);
    const candidates = await this.recoveryCodes.listUnused(user.id);
    let matchedId: string | null = null;
    for (const candidate of candidates) {
      if (await this.hasher.verify(candidate.codeHash, normalizedCode)) {
        matchedId = candidate.id;
        break;
      }
    }
    if (!matchedId) throw invalid;

    const now = Date.now();
    // 条件更新：并发/重放时只有一次能成功
    const consumed = await this.recoveryCodes.consume(user.id, matchedId, now, ctx.ip);
    if (!consumed) throw invalid;

    const passwordHash = await this.hasher.hash(input.newPassword);
    await this.users.updatePassword(user.id, passwordHash, now);
    await this.sessions.revokeAllForUser(user.id, 'recovery_used', now);

    const plainCodes = generateRecoveryCodes({ count: this.config.recoveryCodeCount, randomBytes });
    const codeHashes = await Promise.all(plainCodes.map((code) => this.hasher.hash(code)));
    await this.recoveryCodes.replaceAllForUser(user.id, codeHashes, now);

    await this.audit.record({
      actorUserId: user.id,
      actorType: 'user',
      action: 'auth.recovery.succeeded',
      targetType: 'user',
      targetId: user.id,
      result: 'success',
      ...ctx,
    });

    const updated = await this.users.findById(user.id);
    if (!updated) throw new AppError(ErrorCode.INTERNAL_ERROR, '用户状态异常', 500);
    return { user: await this.users.toPublicUser(updated), recoveryCodes: plainCodes };
  }
```

`auth.controller.ts` 追加：

```ts
  @Public()
  @Post('recovery')
  @HttpCode(200)
  async recovery(@Body() dto: RecoveryDto, @Req() req: RequestWithId) {
    return { data: await this.auth.recover(dto, toContext(req)) };
  }
```

> **顺序要求**：先校验新密码强度再消费恢复码（由测试「弱新密码不消耗恢复码」验证）；`replaceAllForUser` 会删除该用户全部旧码并写入新码，保证旧码整组作废。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test --workspace @leximochi/server`
Expected: `recovery.e2e` 6 个用例全部通过

- [ ] **Step 5: Commit**

```bash
git add apps/server/src apps/server/test
git commit -m "feat(auth): 实现一次性恢复码重置密码与全会话撤销"
```

---

# Task 9: 限流、暴力破解防护与速率控制

**Files:**
- Create: `apps/server/src/modules/auth/domain/auth-attempt.repository.ts`, `apps/server/src/database/repositories/drizzle-auth-attempt.repository.ts`, `apps/server/src/modules/auth/rate-limit.service.ts`
- Modify: `apps/server/src/modules/auth/{auth.service.ts,auth.module.ts,auth.controller.ts}`
- Test: `apps/server/test/rate-limit.spec.ts`, `apps/server/test/lockout.e2e-spec.ts`

**Interfaces:**
- Consumes: `auth_attempts` 表、`ServerConfig.lockout`
- Produces:
  - `AuthAttemptRepository`（`record`/`countFailures`/`clearForUser`）
  - `RateLimitService.assertLoginAllowed(...)` / `.assertRegisterAllowed(...)` / `.assertRecoveryAllowed(...)` / `.assertCaptchaAllowed(...)`
  - 登录锁定：同一用户名连续失败达阈值 → 抛 `AppError(ErrorCode.AUTH_ACCOUNT_LOCKED, ..., 429)`

- [ ] **Step 1: 写失败测试**

`apps/server/test/rate-limit.spec.ts`：

```ts
import { RateLimitService } from '../src/modules/auth/rate-limit.service';

describe('RateLimitService', () => {
  const windowMs = 15 * 60 * 1000;
  let counts: number[] = [];
  const service = new RateLimitService(
    {
      record: async () => undefined,
      countFailures: async () => counts.shift() ?? 0,
      clearForUser: async () => undefined,
    },
    { maxFailuresPerUser: 5, maxFailuresPerIp: 20, windowMinutes: 15 },
  );

  it('未达阈值时放行', async () => {
    counts = [4, 1];
    await expect(service.assertLoginAllowed({ usernameCanonical: 'a', ip: '1.1.1.1' })).resolves.toBeUndefined();
  });

  it('用户名维度达阈值时拒绝', async () => {
    counts = [5, 0];
    await expect(service.assertLoginAllowed({ usernameCanonical: 'a', ip: '1.1.1.1' })).rejects.toThrow(
      /锁定|尝试/,
    );
  });

  it('IP 维度达阈值时拒绝', async () => {
    counts = [0, 20];
    await expect(service.assertLoginAllowed({ usernameCanonical: 'a', ip: '1.1.1.1' })).rejects.toThrow();
  });

  it('窗口时长按配置计算', () => {
    expect(service.windowMs()).toBe(windowMs);
  });
});
```

`apps/server/test/lockout.e2e-spec.ts`：

```ts
describe('登录暴力破解防护', () => {
  it('连续失败达到阈值后返回 429 并记录审计', async () => {
    await registerUser('laura_13', 'Str0ng-Passphrase');
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-client-type', 'mobile')
        .send({ username: 'laura_13', password: 'Wr0ng-Passphrase!' });
      expect(res.status).toBe(401);
    }
    const locked = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username: 'laura_13', password: 'Str0ng-Passphrase' });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('AUTH_ACCOUNT_LOCKED');

    const audit = db.sqlite
      .prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'auth.login.locked'")
      .get() as { c: number };
    expect(audit.c).toBeGreaterThan(0);
  });

  it('成功登录会清除该用户名的失败计数', async () => {
    await registerUser('mike_14', 'Str0ng-Passphrase');
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username: 'mike_14', password: 'Wr0ng-Passphrase!' });
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username: 'mike_14', password: 'Str0ng-Passphrase' });
    const failures = db.sqlite
      .prepare("SELECT COUNT(*) AS c FROM auth_attempts WHERE kind='login' AND username_canonical='mike_14' AND success=0")
      .get() as { c: number };
    expect(failures.c).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace @leximochi/server`
Expected: FAIL，`Cannot find module '../src/modules/auth/rate-limit.service'`

- [ ] **Step 3: 实现**

`apps/server/src/modules/auth/domain/auth-attempt.repository.ts`：

```ts
export const AUTH_ATTEMPT_REPOSITORY = 'AUTH_ATTEMPT_REPOSITORY';

export interface AuthAttemptRepository {
  record(input: {
    id: string;
    kind: 'login' | 'register' | 'refresh' | 'recovery' | 'captcha';
    usernameCanonical: string | null;
    ip: string | null;
    success: boolean;
    createdAt: number;
  }): Promise<void>;
  countFailures(input: {
    kind: 'login' | 'register' | 'refresh' | 'recovery' | 'captcha';
    usernameCanonical?: string | null;
    ip?: string | null;
    since: number;
  }): Promise<number>;
  /** 成功登录后清除该用户名维度的失败记录 */
  clearForUser(kind: string, usernameCanonical: string): Promise<void>;
}
```

`apps/server/src/modules/auth/rate-limit.service.ts`：

```ts
import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '@leximochi/types';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors/app-error';
import type { ServerConfig } from '../../config/configuration';
import {
  AUTH_ATTEMPT_REPOSITORY,
  type AuthAttemptRepository,
} from './domain/auth-attempt.repository';

type AttemptKind = 'login' | 'register' | 'refresh' | 'recovery' | 'captcha';

const REGISTER_MAX_PER_IP_PER_HOUR = 10;
const RECOVERY_MAX_PER_USER_PER_HOUR = 5;
const CAPTCHA_MAX_PER_IP_PER_10_MIN = 30;

@Injectable()
export class RateLimitService {
  constructor(
    @Inject(AUTH_ATTEMPT_REPOSITORY) private readonly attempts: AuthAttemptRepository,
    private readonly lockout: ServerConfig['lockout'],
    private readonly now: () => number = Date.now,
  ) {}

  windowMs(): number {
    return this.lockout.windowMinutes * 60 * 1000;
  }

  async assertLoginAllowed(input: { usernameCanonical: string; ip: string | null }): Promise<void> {
    const since = this.now() - this.windowMs();
    const perUser = await this.attempts.countFailures({
      kind: 'login',
      usernameCanonical: input.usernameCanonical,
      since,
    });
    if (perUser >= this.lockout.maxFailuresPerUser) {
      throw new AppError(
        ErrorCode.AUTH_ACCOUNT_LOCKED,
        `登录尝试过于频繁，请 ${this.lockout.windowMinutes} 分钟后再试`,
        429,
      );
    }
    if (input.ip) {
      const perIp = await this.attempts.countFailures({ kind: 'login', ip: input.ip, since });
      if (perIp >= this.lockout.maxFailuresPerIp) {
        throw new AppError(ErrorCode.RATE_LIMITED, '登录尝试过于频繁，请稍后再试', 429);
      }
    }
  }

  async assertRegisterAllowed(ip: string | null): Promise<void> {
    if (!ip) return;
    const count = await this.attempts.countFailures({
      kind: 'register',
      ip,
      since: this.now() - 60 * 60 * 1000,
    });
    if (count >= REGISTER_MAX_PER_IP_PER_HOUR) {
      throw new AppError(ErrorCode.RATE_LIMITED, '注册过于频繁，请稍后再试', 429);
    }
  }

  async assertRecoveryAllowed(usernameCanonical: string): Promise<void> {
    const count = await this.attempts.countFailures({
      kind: 'recovery',
      usernameCanonical,
      since: this.now() - 60 * 60 * 1000,
    });
    if (count >= RECOVERY_MAX_PER_USER_PER_HOUR) {
      throw new AppError(ErrorCode.RATE_LIMITED, '恢复码尝试过于频繁，请稍后再试', 429);
    }
  }

  async assertCaptchaAllowed(ip: string | null): Promise<void> {
    if (!ip) return;
    const count = await this.attempts.countFailures({
      kind: 'captcha',
      ip,
      since: this.now() - 10 * 60 * 1000,
    });
    if (count >= CAPTCHA_MAX_PER_IP_PER_10_MIN) {
      throw new AppError(ErrorCode.RATE_LIMITED, '请求过于频繁，请稍后再试', 429);
    }
  }

  async record(input: {
    kind: AttemptKind;
    usernameCanonical?: string | null;
    ip: string | null;
    success: boolean;
  }): Promise<void> {
    await this.attempts.record({
      id: randomUUID(),
      kind: input.kind,
      usernameCanonical: input.usernameCanonical ?? null,
      ip: input.ip,
      success: input.success,
      createdAt: this.now(),
    });
  }
}
```

接入点（`AuthService`）：
1. `login` 开头调用 `assertLoginAllowed`；失败时 `record({kind:'login', success:false})`；**成功时** `record({kind:'login', success:true})` + `clearForUser('login', canonical)`。
2. `register` 开头调用 `assertRegisterAllowed`（验证码校验之后），注册失败/成功分别记录 `kind='register'`。
3. `recover` 开头调用 `assertRecoveryAllowed`，结果记录 `kind='recovery'`。
4. `issueCaptcha` 调用 `assertCaptchaAllowed` 并记录 `kind='captcha'`。
5. 命中锁定（`AUTH_ACCOUNT_LOCKED`）时写审计 `auth.login.locked`。

> 计数窗口与阈值全部来自 `ServerConfig.lockout` 与环境变量，**不得硬编码**。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test --workspace @leximochi/server`
Expected: `rate-limit` 4 个用例、`lockout.e2e` 2 个用例全部通过

- [ ] **Step 5: Commit**

```bash
git add apps/server/src apps/server/test
git commit -m "feat(auth): 实现登录锁定、限流与失败计数清理"
```

---

# Task 10: RBAC 与后台用户管理

**Files:**
- Create: `apps/server/src/common/guards/permissions.guard.ts`, `apps/server/src/common/decorators/require-permissions.decorator.ts`
- Create: `apps/server/src/modules/admin/{admin.controller.ts,admin.service.ts,admin.module.ts}`, `apps/server/src/modules/admin/dto/{list-users.dto.ts,ban-user.dto.ts,list-audit.dto.ts}`
- Create: `apps/server/src/modules/users/dto/user-admin.dto.ts`
- Modify: `apps/server/src/modules/users/domain/user.repository.ts`（追加 `listForAdmin`/`findForAdmin`）、`apps/server/src/database/repositories/drizzle-user.repository.ts`
- Test: `apps/server/test/admin-authz.e2e-spec.ts`, `apps/server/test/admin-users.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 6–9 全部
- Produces:
  - `@RequirePermissions(...permissions)`、`PermissionsGuard`（全局守卫，声明式校验）
  - `GET /admin/users`、`GET /admin/users/:id`、`POST /admin/users/:id/ban`、`POST /admin/users/:id/unban`、`GET /admin/audit-logs`

- [ ] **Step 1: 写失败测试**

`apps/server/test/admin-authz.e2e-spec.ts`：

```ts
describe('后台权限隔离', () => {
  it('普通用户访问任何 /admin 接口返回 403', async () => {
    const user = await registerAndLogin('nina_15', 'Str0ng-Passphrase');
    for (const call of [
      () => request(app.getHttpServer()).get('/admin/users').set('authorization', `Bearer ${user.accessToken}`),
      () => request(app.getHttpServer()).get('/admin/audit-logs').set('authorization', `Bearer ${user.accessToken}`),
      () => request(app.getHttpServer()).post('/admin/users/some-id/ban').set('authorization', `Bearer ${user.accessToken}`).send({ reason: 'x' }),
    ]) {
      const res = await call();
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('未认证访问 /admin 返回 401', async () => {
    const res = await request(app.getHttpServer()).get('/admin/users');
    expect(res.status).toBe(401);
  });

  it('管理员可访问用户列表', async () => {
    const admin = await createAdminAndLogin('admin_user', 'Adm1n-Passphrase!');
    const res = await request(app.getHttpServer())
      .get('/admin/users')
      .set('authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('降权后立即失效（权限每次请求从数据库读取）', async () => {
    const admin = await createAdminAndLogin('temp_admin', 'Adm1n-Passphrase!');
    const ok = await request(app.getHttpServer())
      .get('/admin/users')
      .set('authorization', `Bearer ${admin.accessToken}`);
    expect(ok.status).toBe(200);

    db.sqlite
      .prepare(
        `DELETE FROM user_roles WHERE user_id = (SELECT id FROM users WHERE username_canonical = 'temp_admin')
         AND role_id = (SELECT id FROM roles WHERE key = 'admin')`,
      )
      .run();

    const denied = await request(app.getHttpServer())
      .get('/admin/users')
      .set('authorization', `Bearer ${admin.accessToken}`);
    expect(denied.status).toBe(403);
  });
});
```

`apps/server/test/admin-users.e2e-spec.ts`：

```ts
describe('后台用户管理', () => {
  it('用户列表不返回密码哈希等敏感字段', async () => {
    const admin = await createAdminAndLogin('admin_a', 'Adm1n-Passphrase!');
    await registerUser('olive_16', 'Str0ng-Passphrase');
    const res = await request(app.getHttpServer())
      .get('/admin/users?query=olive')
      .set('authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|passwordHash|\$argon2/);
  });

  it('封禁用户后其会话被撤销且无法登录，审计被写入', async () => {
    const admin = await createAdminAndLogin('admin_b', 'Adm1n-Passphrase!');
    const victim = await registerAndLogin('peter_17', 'Str0ng-Passphrase');

    const banned = await request(app.getHttpServer())
      .post(`/admin/users/${victim.userId}/ban`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: '违规测试' });
    expect(banned.status).toBe(200);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('authorization', `Bearer ${victim.accessToken}`);
    expect(me.status).toBe(403);

    const relogin = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username: 'peter_17', password: 'Str0ng-Passphrase' });
    expect(relogin.status).toBe(403);

    const audit = db.sqlite
      .prepare("SELECT actor_user_id, action FROM audit_logs WHERE action = 'admin.user.banned' AND target_id = ?")
      .all(victim.userId) as Array<{ actor_user_id: string | null; action: string }>;
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor_user_id).toBe(admin.userId);
  });

  it('解封后可重新登录', async () => {
    const admin = await createAdminAndLogin('admin_c', 'Adm1n-Passphrase!');
    const victim = await registerAndLogin('quinn_18', 'Str0ng-Passphrase');
    await request(app.getHttpServer())
      .post(`/admin/users/${victim.userId}/ban`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: '测试' });
    const unban = await request(app.getHttpServer())
      .post(`/admin/users/${victim.userId}/unban`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .send({});
    expect(unban.status).toBe(200);
    const relogin = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username: 'quinn_18', password: 'Str0ng-Passphrase' });
    expect(relogin.status).toBe(200);
  });

  it('不能封禁自己', async () => {
    const admin = await createAdminAndLogin('admin_d', 'Adm1n-Passphrase!');
    const res = await request(app.getHttpServer())
      .post(`/admin/users/${admin.userId}/ban`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: '自封测试' });
    expect(res.status).toBe(400);
  });

  it('封禁不存在的用户返回 404', async () => {
    const admin = await createAdminAndLogin('admin_e', 'Adm1n-Passphrase!');
    const res = await request(app.getHttpServer())
      .post('/admin/users/00000000-0000-4000-8000-000000000000/ban')
      .set('authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'x' });
    expect(res.status).toBe(404);
  });

  it('审计日志可按动作过滤且不包含秘密', async () => {
    const admin = await createAdminAndLogin('admin_f', 'Adm1n-Passphrase!');
    const res = await request(app.getHttpServer())
      .get('/admin/audit-logs?action=admin.user.banned&limit=10')
      .set('authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/\$argon2|Bearer |password_hash/);
  });
});
```

测试辅助（`apps/server/test/helpers/factories.ts`）需实现：`registerUser(username, password)`、`registerAndLogin(...)`、`createAdminAndLogin(...)`（直接写库授予 `admin` 角色后登录）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace @leximochi/server`
Expected: FAIL，`/admin/users` 返回 404

- [ ] **Step 3: 实现权限守卫**

`apps/server/src/common/decorators/require-permissions.decorator.ts`：

```ts
import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@leximochi/types';

export const PERMISSIONS_KEY = 'requiredPermissions';

export function RequirePermissions(...permissions: Permission[]): MethodDecorator & ClassDecorator {
  return SetMetadata(PERMISSIONS_KEY, permissions);
}
```

`apps/server/src/common/guards/permissions.guard.ts`：

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@leximochi/types';
import { ErrorCode } from '@leximochi/types';
import { AppError } from '../errors/app-error';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { AuthenticatedUser } from './jwt-auth.guard';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const granted = req.user?.permissions ?? [];
    const ok = required.every((permission) => granted.includes(permission));
    if (!ok) {
      // 统一 403：不区分「无权限」与「资源不存在」，避免泄露后台结构
      throw new AppError(ErrorCode.FORBIDDEN, '没有权限执行该操作', 403);
    }
    return true;
  }
}
```

`PermissionsGuard` 注册为全局守卫，且必须排在后于 `JwtAuthGuard` 的位置（`APP_GUARD` 注册顺序即执行顺序）。

- [ ] **Step 4: 实现后台接口**

`apps/server/src/modules/admin/dto/list-users.dto.ts`：

```ts
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListUsersDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  query?: string;

  @IsOptional()
  @IsIn(['active', 'banned'])
  status?: 'active' | 'banned';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  cursor?: string;
}
```

`apps/server/src/modules/admin/dto/ban-user.dto.ts`：

```ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class BanUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reason!: string;
}
```

`apps/server/src/modules/admin/admin.service.ts`（核心逻辑）：

```ts
  async banUser(actor: AuthenticatedUser, targetUserId: string, reason: string, ctx: RequestContext): Promise<void> {
    if (actor.userId === targetUserId) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, '不能封禁自己', 400);
    }
    const target = await this.users.findById(targetUserId);
    if (!target) throw new AppError(ErrorCode.USER_NOT_FOUND, '用户不存在', 404);

    await this.users.setStatus(targetUserId, 'banned', {
      reason,
      actorId: actor.userId,
      now: Date.now(),
    });
    await this.sessions.revokeAllForUser(targetUserId, 'banned', Date.now());
    await this.audit.record({
      actorUserId: actor.userId,
      actorType: 'admin',
      action: 'admin.user.banned',
      targetType: 'user',
      targetId: targetUserId,
      result: 'success',
      metadata: { reason },
      ...ctx,
    });
  }
```

配套要求：
- `unbanUser`：`setStatus('active')` + 审计 `admin.user.unbanned`（**不**恢复旧会话，用户需重新登录）。
- `listUsers`：返回 `AdminUserPage`，按 `createdAt desc, id desc` 游标分页；`query` 对 `username`/`username_canonical` 做 `LIKE` 前缀匹配（转义 `%`/`_`）；**只返回** `AdminUserSummary` 字段。
- `getUser`：返回单个 `AdminUserSummary`，不存在返回 404。
- `listAuditLogs`：委托 `AuditService.list`，`limit` 上限 100。
- 全部 `/admin/*` 控制器加 `@RequirePermissions(Permission.AdminUsersRead)`（封禁接口为 `AdminUsersBan`，审计为 `AdminAuditRead`）。

`apps/server/src/modules/admin/admin.controller.ts`：

```ts
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @RequirePermissions(Permission.AdminUsersRead)
  @Get('users')
  async listUsers(@Query() query: ListUsersDto) {
    return { data: await this.admin.listUsers(query) };
  }

  @RequirePermissions(Permission.AdminUsersBan)
  @Post('users/:id/ban')
  @HttpCode(200)
  async ban(@Param('id') id: string, @Body() dto: BanUserDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: RequestWithId) {
    await this.admin.banUser(actor, id, dto.reason, toContext(req));
    return { data: { ok: true } };
  }

  @RequirePermissions(Permission.AdminAuditRead)
  @Get('audit-logs')
  async auditLogs(@Query() query: ListAuditDto) {
    return { data: await this.admin.listAuditLogs(query) };
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test --workspace @leximochi/server`
Expected: `admin-authz.e2e` 4 个用例、`admin-users.e2e` 6 个用例全部通过

- [ ] **Step 6: 创建管理员初始化脚本**

`apps/server/src/scripts/create-admin.ts` 要求：
1. 从 `process.argv` 读取 `--username`（必须），密码**只能**从环境变量 `ADMIN_PASSWORD` 读取；缺失则打印用法并以退出码 1 结束。
2. 使用 `@leximochi/core` 的 `validateUsername` / `validatePassword` 校验。
3. 已存在同名用户时报错退出，除非显式传入 `--allow-existing`。
4. 在事务内创建用户并授予 `admin` 角色，写审计 `admin.bootstrap.created`。
5. **只输出用户名，绝不输出密码**；脚本不得把密码写入日志或文件。

- [ ] **Step 7: 运行测试并提交**

Run: `npm run build --workspace @leximochi/server && npm test --workspace @leximochi/server`
Expected: 全部用例通过（累计 ≥ 45 个）

```bash
git add apps/server/src apps/server/test
git commit -m "feat(admin): 实现 RBAC 权限守卫、后台用户管理与审计查询"
```

---

# Task 11: packages/api-client + packages/auth

**Files:**
- Create: `packages/api-client/{package.json,tsconfig.json,jest.config.cjs}`, `packages/api-client/src/{index,http-client,api-error,endpoints/auth.endpoints.ts,endpoints/admin.endpoints.ts,endpoints/user.endpoints.ts}`
- Create: `packages/auth/{package.json,tsconfig.json,jest.config.cjs}`, `packages/auth/src/{index,session-store,session-manager}.ts`
- Test: `packages/api-client/src/http-client.spec.ts`, `packages/auth/src/session-manager.spec.ts`

**Interfaces:**
- Consumes: `@leximochi/types`
- Produces:
  - `ApiError`（含 `code`、`status`、`requestId`）、`HttpClientOptions`、`createApiClient(options): ApiClient`
  - `ApiClient.auth.{issueCaptcha,register,login,refresh,logout,logoutAll,me,listSessions,deleteSession,recover}`
  - `ApiClient.admin.{listUsers,getUser,banUser,unbanUser,listAuditLogs}`
  - `SessionStore`（`getAccessToken`/`setTokens`/`clear`）、`createSessionManager({client, store, onSessionChange})`

- [ ] **Step 1: 写失败测试**

`packages/api-client/src/http-client.spec.ts`：

```ts
import { ApiError, createApiClient } from './index';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('createApiClient', () => {
  it('成功响应解包 data 字段', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { data: { status: 'ok' } }));
    const client = createApiClient({ baseUrl: 'http://localhost:3000', fetch: fetchMock });
    await expect(client.health()).resolves.toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('错误响应抛出 ApiError 并保留错误码与 requestId', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(401, { error: { code: 'AUTH_INVALID_CREDENTIALS', message: '用户名或密码不正确', requestId: 'r-1' } }),
    );
    const client = createApiClient({ baseUrl: 'http://localhost:3000', fetch: fetchMock });
    await expect(
      client.auth.login({ username: 'a', password: 'b' }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS', status: 401, requestId: 'r-1' });
  });

  it('非 JSON 错误响应仍抛出结构化 ApiError', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers({ 'content-type': 'text/html' }),
      json: async () => {
        throw new Error('not json');
      },
      text: async () => '<html>bad gateway</html>',
    } as unknown as Response);
    const client = createApiClient({ baseUrl: 'http://localhost:3000', fetch: fetchMock });
    await expect(client.health()).rejects.toBeInstanceOf(ApiError);
  });

  it('携带 access token 时注入 Authorization 头', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { data: { id: 'u1' } }));
    const client = createApiClient({
      baseUrl: 'http://localhost:3000',
      fetch: fetchMock,
      getAccessToken: () => 'token-abc',
    });
    await client.auth.me();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-abc');
  });
});
```

`packages/auth/src/session-manager.spec.ts`：

```ts
import { createSessionManager } from './session-manager';
import type { SessionStore } from './session-store';

function memoryStore(): SessionStore & { tokens: { access: string | null; refresh: string | null } } {
  const state = { access: null, refresh: null };
  return {
    tokens: state,
    getAccessToken: () => state.access,
    getRefreshToken: () => state.refresh,
    setTokens: (t) => {
      state.access = t.accessToken;
      state.refresh = t.refreshToken ?? null;
    },
    clear: () => {
      state.access = null;
      state.refresh = null;
    },
  };
}

describe('sessionManager', () => {
  it('登录成功后写入 tokens 并触发回调', async () => {
    const store = memoryStore();
    const events: string[] = [];
    const manager = createSessionManager({
      store,
      onSessionChange: (state) => events.push(state),
      client: {
        auth: {
          login: jest.fn().mockResolvedValue({
            accessToken: 'a1', refreshToken: 'r1', expiresIn: 900,
            user: { id: 'u1', username: 'alice', status: 'active', roles: ['user'], createdAt: 1 },
          }),
          logout: jest.fn().mockResolvedValue(undefined),
          refresh: jest.fn(),
        },
      } as never,
    });

    await manager.login({ username: 'alice', password: 'Str0ng-Passphrase' });
    expect(store.tokens.access).toBe('a1');
    expect(store.tokens.refresh).toBe('r1');
    expect(events).toEqual(['authenticated']);
  });

  it('登出后清空 tokens 并触发回调', async () => {
    const store = memoryStore();
    const events: string[] = [];
    const manager = createSessionManager({
      store,
      onSessionChange: (state) => events.push(state),
      client: {
        auth: { login: jest.fn(), refresh: jest.fn(), logout: jest.fn().mockResolvedValue(undefined) },
      } as never,
    });
    store.setTokens({ accessToken: 'a1', refreshToken: 'r1', expiresIn: 900 });
    await manager.logout();
    expect(store.tokens.access).toBeNull();
    expect(events).toContain('anonymous');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace @leximochi/api-client`
Expected: FAIL，`Cannot find module './index'`

- [ ] **Step 3: 实现 api-client**

`packages/api-client/src/api-error.ts`：

```ts
import type { ErrorCode } from '@leximochi/types';

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly requestId: string;
  readonly details?: Record<string, string[]>;

  constructor(input: { code: ErrorCode; message: string; status: number; requestId: string; details?: Record<string, string[]> }) {
    super(input.message);
    this.name = 'ApiError';
    this.code = input.code;
    this.status = input.status;
    this.requestId = input.requestId;
    this.details = input.details;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
```

`packages/api-client/src/http-client.ts`：

```ts
import { ErrorCode, type ApiErrorResponse } from '@leximochi/types';
import { ApiError } from './api-error';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  baseUrl: string;
  fetch?: FetchLike;
  getAccessToken?: () => string | null;
  /** Web/Admin 使用 Cookie 承载 refresh token */
  credentials?: RequestCredentials;
  /** 客户端类型标记：'mobile' 时 refresh token 走 Body */
  clientType?: 'web' | 'mobile';
  onUnauthorized?: () => void;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  anonymous?: boolean;
}

export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  async request<T>(path: string, request: RequestOptions = {}): Promise<T> {
    const url = new URL(path, this.options.baseUrl);
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = { accept: 'application/json' };
    if (request.body !== undefined) headers['content-type'] = 'application/json';
    const token = this.options.getAccessToken?.();
    if (token && !request.anonymous) headers.authorization = `Bearer ${token}`;
    if (this.options.clientType) headers['x-client-type'] = this.options.clientType;

    const response = await (this.options.fetch ?? fetch)(url.toString(), {
      method: request.method ?? 'GET',
      headers,
      credentials: this.options.credentials ?? 'omit',
      ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
    });

    if (!response.ok) {
      const error = await this.toApiError(response);
      if (error.status === 401) this.options.onUnauthorized?.();
      throw error;
    }

    const payload = (await response.json()) as { data: T };
    return payload.data;
  }

  private async toApiError(response: Response): Promise<ApiError> {
    try {
      const body = (await response.json()) as ApiErrorResponse;
      if (body?.error?.code) {
        return new ApiError({
          code: body.error.code,
          message: body.error.message,
          status: response.status,
          requestId: body.error.requestId ?? '',
          details: body.error.details,
        });
      }
    } catch {
      // 响应体不是 JSON，落到统一兜底
    }
    return new ApiError({
      code: ErrorCode.INTERNAL_ERROR,
      message: '请求失败，请稍后重试',
      status: response.status,
      requestId: '',
    });
  }
}
```

`packages/api-client/src/endpoints/auth.endpoints.ts`（其余端点同结构）：

```ts
import type {
  CaptchaChallenge, LoginResponse, PublicUser, RecoveryResponse, RegisterResponse, SessionSummary,
} from '@leximochi/types';
import type { HttpClient } from '../http-client';

export function authEndpoints(http: HttpClient) {
  return {
    issueCaptcha: () => http.request<CaptchaChallenge>('/auth/captcha', { method: 'POST', anonymous: true }),
    register: (input: { username: string; password: string; captchaToken: string; captchaAnswer: string }) =>
      http.request<RegisterResponse>('/auth/register', { method: 'POST', body: input, anonymous: true }),
    login: (input: { username: string; password: string }) =>
      http.request<LoginResponse>('/auth/login', { method: 'POST', body: input, anonymous: true }),
    refresh: (input: { refreshToken?: string }) =>
      http.request<{ accessToken: string; refreshToken?: string; expiresIn: number }>('/auth/refresh', {
        method: 'POST', body: input, anonymous: true,
      }),
    logout: (input: { refreshToken?: string }) =>
      http.request<{ ok: boolean }>('/auth/logout', { method: 'POST', body: input }),
    logoutAll: () => http.request<{ ok: boolean }>('/auth/logout-all', { method: 'POST', body: {} }),
    me: () => http.request<{ user: PublicUser; permissions: string[] }>('/auth/me'),
    listSessions: () => http.request<SessionSummary[]>('/auth/sessions'),
    deleteSession: (id: string) => http.request<{ ok: boolean }>(`/auth/sessions/${id}`, { method: 'DELETE' }),
    recover: (input: { username: string; recoveryCode: string; newPassword: string; captchaToken: string; captchaAnswer: string }) =>
      http.request<RecoveryResponse>('/auth/recovery', { method: 'POST', body: input, anonymous: true }),
  };
}
```

> `me` 端点需在服务端返回 `{ user, permissions }`，以便前端按权限渲染（**服务端仍会二次校验**）。若 Task 7 实现为只返回 `user`，则同步调整此处类型。

`packages/api-client/src/index.ts`：

```ts
import { HttpClient, type HttpClientOptions } from './http-client';
import { adminEndpoints } from './endpoints/admin.endpoints';
import { authEndpoints } from './endpoints/auth.endpoints';
import { userEndpoints } from './endpoints/user.endpoints';

export * from './api-error';
export * from './http-client';

export function createApiClient(options: HttpClientOptions) {
  const http = new HttpClient(options);
  return {
    health: () => http.request<{ status: string }>('/health', { anonymous: true }),
    auth: authEndpoints(http),
    admin: adminEndpoints(http),
    user: userEndpoints(http),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
```

- [ ] **Step 4: 实现 packages/auth**

`packages/auth/src/session-store.ts`：

```ts
export interface TokenBundle {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface SessionStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(tokens: TokenBundle): void;
  clear(): void;
}

/** 内存实现；Web/RN 各自提供持久化实现（Android 使用系统安全存储） */
export function createMemorySessionStore(): SessionStore {
  let access: string | null = null;
  let refresh: string | null = null;
  return {
    getAccessToken: () => access,
    getRefreshToken: () => refresh,
    setTokens: (tokens) => {
      access = tokens.accessToken;
      refresh = tokens.refreshToken ?? refresh;
    },
    clear: () => {
      access = null;
      refresh = null;
    },
  };
}
```

`packages/auth/src/session-manager.ts`：

```ts
import type { PublicUser } from '@leximochi/types';
import type { SessionStore } from './session-store';

export type SessionState = 'unknown' | 'authenticated' | 'anonymous';

interface MinimalClient {
  auth: {
    login(input: { username: string; password: string }): Promise<{
      accessToken: string; refreshToken?: string; expiresIn: number; user: PublicUser;
    }>;
    logout(input: { refreshToken?: string }): Promise<unknown>;
    refresh(input: { refreshToken?: string }): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }>;
  };
}

export interface SessionManagerOptions {
  client: MinimalClient;
  store: SessionStore;
  onSessionChange?: (state: SessionState) => void;
}

export function createSessionManager(options: SessionManagerOptions) {
  let currentUser: PublicUser | null = null;

  function emit(state: SessionState): void {
    options.onSessionChange?.(state);
  }

  return {
    get currentUser(): PublicUser | null {
      return currentUser;
    },

    async login(input: { username: string; password: string }): Promise<PublicUser> {
      const result = await options.client.auth.login(input);
      options.store.setTokens(result);
      currentUser = result.user;
      emit('authenticated');
      return result.user;
    },

    async restore(): Promise<PublicUser | null> {
      const refreshToken = options.store.getRefreshToken();
      if (!refreshToken && !options.client.auth) {
        emit('anonymous');
        return null;
      }
      try {
        const refreshed = await options.client.auth.refresh(
          refreshToken ? { refreshToken } : {},
        );
        options.store.setTokens(refreshed);
        emit('authenticated');
        return currentUser;
      } catch {
        options.store.clear();
        currentUser = null;
        emit('anonymous');
        return null;
      }
    },

    async logout(): Promise<void> {
      const refreshToken = options.store.getRefreshToken();
      try {
        await options.client.auth.logout(refreshToken ? { refreshToken } : {});
      } catch {
        // 服务端登出失败也要清空本地凭证
      }
      options.store.clear();
      currentUser = null;
      emit('anonymous');
    },
  };
}
```

> cookie 传输模式下（Web/Admin）`refreshToken` 可能不由客户端持有；`restore()` 在无本地 refresh token 时仍调用一次 `refresh`（服务端从 Cookie 读取）。该差异在 Task 12/13 中接入时验证。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run build --workspace @leximochi/types && npm test --workspace @leximochi/api-client && npm test --workspace @leximochi/auth`
Expected: `api-client` 4 个用例、`auth` 2 个用例全部通过

- [ ] **Step 6: Commit**

```bash
git add packages/api-client packages/auth package-lock.json
git commit -m "feat(api-client,auth): 实现类型安全 HTTP 客户端与会话管理器"
```

---

# Task 12: apps/web（用户端 Web）

**Files:**
- Create: `apps/web/{package.json,tsconfig.json,tsconfig.node.json,vite.config.ts,vitest.config.ts,index.html}`
- Create: `apps/web/src/{main.tsx,App.tsx,styles/global.css}`
- Create: `apps/web/src/lib/{api.ts,session.ts}`, `apps/web/src/components/{RequireAuth.tsx,FormField.tsx}`
- Create: `apps/web/src/pages/{LoginPage.tsx,RegisterPage.tsx,HomePage.tsx,SessionsPage.tsx}`
- Test: `apps/web/src/pages/RegisterPage.test.tsx`, `apps/web/src/components/RequireAuth.test.tsx`

**Interfaces:**
- Consumes: `@leximochi/types`、`@leximochi/api-client`、`@leximochi/auth`、`@leximochi/shared`
- Produces: 可运行 Web 应用（注册、登录、受保护首页、设备会话管理、登出）

- [ ] **Step 1: 写失败测试**

`apps/web/src/components/RequireAuth.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RequireAuth } from './RequireAuth';

function renderAt(authenticated: boolean) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <RequireAuth authenticated={authenticated}>
              <div>受保护内容</div>
            </RequireAuth>
          }
        />
        <Route path="/login" element={<div>登录页</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  it('未登录时重定向到登录页', () => {
    renderAt(false);
    expect(screen.getByText('登录页')).toBeDefined();
    expect(screen.queryByText('受保护内容')).toBeNull();
  });

  it('已登录时渲染子内容', () => {
    renderAt(true);
    expect(screen.getByText('受保护内容')).toBeDefined();
  });
});
```

`apps/web/src/pages/RegisterPage.test.tsx`：

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RegisterPage } from './RegisterPage';

describe('RegisterPage', () => {
  it('展示服务端返回的恢复码，并提示用户自行保存', async () => {
    const api = {
      auth: {
        issueCaptcha: vi.fn().mockResolvedValue({ token: 't1', question: '1 + 2 = ?', expiresAt: Date.now() + 60000 }),
        register: vi.fn().mockResolvedValue({
          user: { id: 'u1', username: 'alice', status: 'active', roles: ['user'], createdAt: 1 },
          recoveryCodes: ['AAAA-BBBB-CCCC', 'DDDD-EEEE-FFFF'],
        }),
      },
    };

    render(
      <MemoryRouter>
        <RegisterPage api={api as never} onRegistered={vi.fn()} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('1 + 2 = ?')).toBeDefined());
    await userEvent.type(screen.getByLabelText('用户名'), 'alice');
    await userEvent.type(screen.getByLabelText('密码'), 'Str0ng-Passphrase');
    await userEvent.type(screen.getByLabelText('验证码答案'), '3');
    await userEvent.click(screen.getByRole('button', { name: '注册' }));

    await waitFor(() => expect(screen.getByText('AAAA-BBBB-CCCC')).toBeDefined());
    expect(screen.getByText(/请立即保存/)).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace @leximochi/web`
Expected: FAIL，`Cannot find module './RegisterPage'`

- [ ] **Step 3: 创建 Vite 工程与依赖**

`apps/web/package.json`：

```json
{
  "name": "@leximochi/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "lint": "eslint src"
  },
  "dependencies": {
    "@leximochi/api-client": "*",
    "@leximochi/auth": "*",
    "@leximochi/shared": "*",
    "@leximochi/types": "*",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^5.0.0",
    "jsdom": "^25.0.0",
    "vitest": "5.0.1"
  }
}
```

`apps/web/vite.config.ts`：

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } },
  },
});
```

`apps/web/vitest.config.ts`：

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
  },
});
```

`apps/web/src/test-setup.ts`：`import '@testing-library/jest-dom/vitest';`

`apps/web/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>词团子 Leximochi</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: 实现页面（仅 4 个真实功能页面，不创建空占位页）**

`apps/web/src/lib/session.ts`：

```ts
import { createApiClient } from '@leximochi/api-client';
import { createMemorySessionStore, createSessionManager } from '@leximochi/auth';

const store = createMemorySessionStore();

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  clientType: 'web',
  credentials: 'include',
  getAccessToken: () => store.getAccessToken(),
  onUnauthorized: () => store.clear(),
});

export const session = createSessionManager({ client: api, store });
```

页面职责（要求实现真实交互，不做假数据）：

| 页面 | 功能 |
| --- | --- |
| `RegisterPage` | 拉取验证码挑战 → 填用户名/密码/答案 → 提交 → **展示恢复码并要求用户保存**（提供复制按钮与「我已保存」确认） → 跳转登录 |
| `LoginPage` | 用户名/密码登录；显示通用错误（不区分账号是否存在）；成功后跳转首页 |
| `HomePage` | 受保护：显示当前用户名、账号创建时间、登录设备会话列表（来自 `GET /auth/sessions`）、登出按钮、退出全部设备 |
| `SessionsPage` | 可合并进 `HomePage`；列出会话（UA/IP/创建时间/是否当前），支持删除单条会话 |

`RequireAuth` 组件契约：

```tsx
interface RequireAuthProps {
  authenticated: boolean;
  children: ReactNode;
}

export function RequireAuth({ authenticated, children }: RequireAuthProps): ReactElement {
  if (!authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

样式使用 `@leximochi/shared` 的 `tokens`（内联 CSS 变量或 `global.css` 中映射为 `:root` 变量），**不引入 UI 组件库**（Phase 1 无需）。

- [ ] **Step 5: 运行测试与构建**

Run: `npm test --workspace @leximochi/web && npm run build --workspace @leximochi/web`
Expected: vitest 3 个用例通过；`vite build` 成功产出 `apps/web/dist/`

- [ ] **Step 6: 手动验证（必须实际打开浏览器）**

Run: 后端 `npm run start:dev --workspace @leximochi/server`；前端 `npm run dev --workspace @leximochi/web`
Expected: 完成 注册 → 看到恢复码 → 登录 → 首页显示用户名与会话 → 删除会话 → 登出 → 受保护页跳转登录。将实际结果记入 `HANDOFF.md`。

- [ ] **Step 7: Commit**

```bash
git add apps/web package-lock.json
git commit -m "feat(web): 实现注册/登录/受保护首页与设备会话管理"
```

---

# Task 13: apps/admin（管理后台）

**Files:**
- Create: `apps/admin/{package.json,tsconfig.json,vite.config.ts,vitest.config.ts,index.html}`
- Create: `apps/admin/src/{main.tsx,App.tsx,styles/global.css}`
- Create: `apps/admin/src/lib/{api.ts,format.ts}`
- Create: `apps/admin/src/components/{ConfirmDialog.tsx,AdminLayout.tsx}`
- Create: `apps/admin/src/pages/{AdminLoginPage.tsx,UsersPage.tsx,UserDetailPage.tsx,AuditLogsPage.tsx}`
- Test: `apps/admin/src/pages/UsersPage.test.tsx`, `apps/admin/src/components/ConfirmDialog.test.tsx`

**Interfaces:**
- Consumes: `@leximochi/api-client`、`@leximochi/types`、`@leximochi/shared`
- Produces: 独立后台应用（管理员登录、用户检索、封禁/解封（二次确认）、审计日志）

- [ ] **Step 1: 写失败测试**

`apps/admin/src/components/ConfirmDialog.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('确认后才触发回调', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="确认封禁"
        description="封禁后该用户将无法登录"
        requireReason
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const confirmButton = screen.getByRole('button', { name: '确认' });
    expect(confirmButton).toBeDisabled();
    await userEvent.type(screen.getByLabelText('原因'), '违规');
    await userEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledWith({ reason: '违规' });
  });
});
```

`apps/admin/src/pages/UsersPage.test.tsx`：

```tsx
describe('UsersPage', () => {
  it('封禁需要二次确认，确认后调用封禁接口并刷新列表', async () => {
    const api = {
      admin: {
        listUsers: vi.fn().mockResolvedValue({
          items: [
            { id: 'u1', username: 'alice', status: 'active', roles: ['user'], createdAt: 1, lastLoginAt: null },
          ],
          nextCursor: null,
        }),
        banUser: vi.fn().mockResolvedValue({ ok: true }),
        unbanUser: vi.fn().mockResolvedValue({ ok: true }),
      },
    };
    render(<UsersPage api={api as never} />);

    await waitFor(() => expect(screen.getByText('alice')).toBeDefined());
    expect(api.admin.banUser).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '封禁' }));
    await userEvent.type(screen.getByLabelText('原因'), '违规内容');
    await userEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => expect(api.admin.banUser).toHaveBeenCalledWith('u1', { reason: '违规内容' }));
    expect(api.admin.listUsers).toHaveBeenCalledTimes(2);
  });

  it('权限不足时展示明确错误而不崩溃', async () => {
    const api = {
      admin: {
        listUsers: vi.fn().mockRejectedValue(new ApiError({ code: 'FORBIDDEN', message: '没有权限执行该操作', status: 403, requestId: 'r1' })),
        banUser: vi.fn(),
        unbanUser: vi.fn(),
      },
    };
    render(<UsersPage api={api as never} />);
    await waitFor(() => expect(screen.getByText(/没有权限/)).toBeDefined());
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace @leximochi/admin`
Expected: FAIL，`Cannot find module './UsersPage'`

- [ ] **Step 3: 实现**

工程结构与依赖同 `apps/web`，差异点：
- 端口 `5174`；`vite.config.ts` 代理 `/api` → `http://localhost:3000`。
- `clientType: 'web'`、`credentials: 'include'`（与 Web 共用 HttpOnly Cookie 方案，但**独立应用、独立构建产物**）。
- 登录后调用 `GET /auth/me`，若 `permissions` 不含任何 `admin.*` 权限则提示「该账号无后台权限」并清除会话（服务端仍会返回 403，前端仅做体验优化）。

页面要求：

| 页面 | 功能 |
| --- | --- |
| `AdminLoginPage` | 管理员登录；非管理员账号明确提示无权限 |
| `UsersPage` | 支持 `query`/`status` 过滤与游标分页；显示 id、用户名、状态、角色、创建时间、最后登录；操作列：封禁（弹 `ConfirmDialog` 必填原因）/ 解封 |
| `UserDetailPage` | 单用户信息与相关审计事件（按 `targetId` 过滤） |
| `AuditLogsPage` | 按 `action` 与 `limit` 查询审计日志；只读 |

`ConfirmDialog` 契约（与测试一致）：

```tsx
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  requireReason?: boolean;
  onConfirm: (input: { reason: string }) => void;
  onCancel: () => void;
}
```

- [ ] **Step 4: 运行测试与构建**

Run: `npm test --workspace @leximochi/admin && npm run build --workspace @leximochi/admin`
Expected: vitest 3 个用例通过；构建产出 `apps/admin/dist/`

- [ ] **Step 5: 手动验证**

Run: 用 `create-admin` 脚本创建管理员 → 启动后端与 `apps/admin` → 登录 → 检索用户 → 封禁（确认弹窗）→ 查看审计日志。结果记入 `HANDOFF.md`。

- [ ] **Step 6: Commit**

```bash
git add apps/admin package-lock.json
git commit -m "feat(admin): 实现独立管理后台（用户管理与审计日志）"
```

---

# Task 14: apps/mobile（React Native Android）

**Files:**
- Create: `apps/mobile/`（由 RN 模板生成的 Android 工程，移除 iOS 目录）
- Modify: `apps/mobile/package.json`（改为 `@leximochi/mobile` 并接入 workspace 依赖）
- Create: `apps/mobile/metro.config.js`, `apps/mobile/App.tsx`, `apps/mobile/src/{lib/api.ts,lib/session-store.ts,screens/LoginScreen.tsx,screens/HomeScreen.tsx}`
- Modify: `apps/mobile/android/gradle.properties`（代理配置）
- Test: `apps/mobile/__tests__/session-store.test.ts`

**Interfaces:**
- Consumes: `@leximochi/api-client`、`@leximochi/auth`、`@leximochi/types`、`@leximochi/shared`
- Produces: 可在 Android 构建出 debug APK 的应用（登录、显示当前用户、登出）

- [ ] **Step 1: 生成 Android 工程骨架**

Run:
```bash
cd apps && npx @react-native-community/cli@20.2.0 init LeximochiMobile \
  --directory mobile --version 0.87.1 --skip-install --pm npm
```
Expected: 生成 `apps/mobile`（含 `android/`、`ios/`、`App.tsx`、`metro.config.js`、`jest.config.js`）

随后：
- 删除 `apps/mobile/ios/`（V1 不开发 iOS）与 `apps/mobile/.bundle/`（如有）。
- 把 `package.json` 的 `name` 改为 `@leximochi/mobile`，`private: true`，补充 `"typecheck": "tsc --noEmit"`、`"test": "jest"`、`"build:android": "cd android && ./gradlew assembleDebug"`。
- 增加 workspace 依赖：`"@leximochi/api-client": "*"`、`"@leximochi/auth": "*"`、`"@leximochi/shared": "*"`、`"@leximochi/types": "*"`。

- [ ] **Step 2: 配置 Metro 支持 monorepo**

`apps/mobile/metro.config.js`：

```js
const path = require('node:path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    disableHierarchicalLookup: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
```

- [ ] **Step 3: 配置 Gradle 代理（项目范围，且不影响直连可达的域名）**

在 `apps/mobile/android/gradle.properties` 末尾追加：

```properties
# 仅为无法直连的仓库启用代理（本机实测：repo.maven.apache.org 直连超时）
systemProp.http.proxyHost=127.0.0.1
systemProp.http.proxyPort=10808
systemProp.https.proxyHost=127.0.0.1
systemProp.https.proxyPort=10808
# Google Maven、Gradle 发行包与本地地址直连可达，不走代理
systemProp.http.nonProxyHosts=dl.google.com|*.google.com|services.gradle.org|registry.npmjs.org|localhost|127.0.0.1
systemProp.https.nonProxyHosts=dl.google.com|*.google.com|services.gradle.org|registry.npmjs.org|localhost|127.0.0.1
```

> 若代理未启动，构建仍可完成（Google 源直连可用）；仅当确实需要 Maven Central 时才依赖代理。该行为需在 Step 6 实测记录。

- [ ] **Step 4: 写失败测试（本地会话存储）**

`apps/mobile/__tests__/session-store.test.ts`：

```ts
import { createInMemorySessionStore } from '../src/lib/session-store';

describe('createInMemorySessionStore', () => {
  it('保存并读取 token', () => {
    const store = createInMemorySessionStore();
    expect(store.getAccessToken()).toBeNull();
    store.setTokens({ accessToken: 'a1', refreshToken: 'r1', expiresIn: 900 });
    expect(store.getAccessToken()).toBe('a1');
    expect(store.getRefreshToken()).toBe('r1');
  });

  it('清除后不保留任何凭证', () => {
    const store = createInMemorySessionStore();
    store.setTokens({ accessToken: 'a1', refreshToken: 'r1', expiresIn: 900 });
    store.clear();
    expect(store.getAccessToken()).toBeNull();
    expect(store.getRefreshToken()).toBeNull();
  });
});
```

- [ ] **Step 5: 实现移动端代码**

`apps/mobile/src/lib/session-store.ts`：

```ts
import type { SessionStore } from '@leximochi/auth';

/** Phase 1 使用内存存储；Phase 7 接入 Android Keystore 支持的持久化存储 */
export function createInMemorySessionStore(): SessionStore {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  return {
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
    setTokens: (tokens) => {
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken ?? refreshToken;
    },
    clear: () => {
      accessToken = null;
      refreshToken = null;
    },
  };
}
```

`apps/mobile/src/lib/api.ts`：

```ts
import { createApiClient } from '@leximochi/api-client';
import { createSessionManager } from '@leximochi/auth';
import { createInMemorySessionStore } from './session-store';

const store = createInMemorySessionStore();

export const api = createApiClient({
  baseUrl: process.env.LEXIMOCHI_API_BASE_URL ?? 'http://10.0.2.2:3000',
  clientType: 'mobile',
  getAccessToken: () => store.getAccessToken(),
  onUnauthorized: () => store.clear(),
});

export const session = createSessionManager({ client: api, store });
```

`LoginScreen` 要求：用户名、密码输入 + 登录按钮 + 错误提示（展示 `ApiError.message`，不展示堆栈）。
`HomeScreen` 要求：显示当前用户名与账号创建时间 + 登出按钮。
`App.tsx`：根据会话状态在 `LoginScreen` 与 `HomeScreen` 之间切换；**不实现任何学习/奖励逻辑**。

- [ ] **Step 6: 安装依赖、运行测试与 Android 构建**

Run:
```bash
npm install
npm test --workspace @leximochi/mobile
npm run build:android --workspace @leximochi/mobile
```
Expected: jest 2 个用例通过；`gradlew assembleDebug` 成功产出
`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`（记录文件大小）。
首次构建需下载 Gradle 9.4.1 与依赖，耗时较长（可能 10 分钟以上）。**如构建失败，记录真实错误与已尝试方法，不要反复重试。**

- [ ] **Step 7: 记录真实环境注意事项**

把以下内容写入 `HANDOFF.md`：Metro 配置是否生效、Gradle 代理是否必要（代理开启/关闭两种情况的实测结果）、APK 路径与大小、是否缺少任何 SDK 组件。

- [ ] **Step 8: Commit**

```bash
git add apps/mobile package-lock.json .gitignore
git commit -m "feat(mobile): 初始化 React Native Android 端并接入 API 客户端"
```

---

# Task 15: Phase 1 全量验收与安全自检

**Files:**
- Create: `docs/phase-1-acceptance.md`
- Modify: `HANDOFF.md`, `README.md`, `docs/architecture.md`（如有偏差）
- Create（如需）: `docs/api.md`（Phase 1 端点清单）

**Interfaces:**
- Consumes: 前 14 个任务的全部产出
- Produces: Phase 1 验收报告（真实命令与结果）、更新后的交接文档

- [ ] **Step 1: 执行全量验证并**原样记录**输出**

逐条执行并记录命令、退出码与关键输出（**禁止**只写「通过」）：

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test --workspace @leximochi/server          # 服务端单元 + 集成
npm run build:android --workspace @leximochi/mobile # Android 构建
```

- [ ] **Step 2: 逐项核对 Phase 1 验收标准**

见本文件末尾「Phase 1 验收标准」，逐条填写证据（命令 + 实际输出摘要）。任一条不满足则**不得**声明 Phase 1 完成。

- [ ] **Step 3: 安全自检（对照 SECURITY-GUARDRAILS 第 15.2 / 15.3 节）**

必查项：
1. `git status` 与暂存区：无 `.env`、无 `data/`、无密钥、无数据库文件。
2. 仓库无硬编码秘密：`git grep -nE "sk-[A-Za-z0-9]{10,}|BEGIN [A-Z ]*PRIVATE KEY"` 无命中。
3. 日志与错误响应抽样：访问一个不存在路由、一次错误登录、一次错误验证码，确认响应**不含** SQL/路径/堆栈/Token。
4. 普通用户无法访问 `/admin/*`（已由测试覆盖，需在报告中引用测试名与结果）。
5. 幂等与事务：`recovery_codes.consume` 条件更新、`users.create` 唯一约束已由测试覆盖。
6. 依赖审计：`npm audit --omit=dev`（记录结果与处置结论，无高危可忽略项）。
7. 未安装任何未经批准的系统软件/SDK/CLI（记录本次为 Android 构建实际下载了哪些依赖，以及是否需要向用户申请）。
8. `.env.example` 与 `config/configuration.ts` 的必需变量一一对应。

- [ ] **Step 4: 撰写 `docs/phase-1-acceptance.md`**

至少包含：已完成内容、未完成内容（含明确推迟项与原因）、实际执行的测试命令与结果摘要、安全检查结果、重要技术决策、Git 提交列表、已知问题与风险、下一阶段计划。

- [ ] **Step 5: 更新交接与文档**

- `HANDOFF.md`：Phase 状态、目录结构、真实版本、migration 状态、数据模型、API 清单、各端可运行状态、已解决/未解决风险、真实命令与结果、下一步优先级。
- `README.md`：最新可运行命令与验证过的步骤。
- `docs/api.md`：Phase 1 实际端点（方法、路径、鉴权要求、请求/响应要点）。

- [ ] **Step 6: Commit**

```bash
git add docs HANDOFF.md README.md
git commit -m "docs(phase-1): 完成 Phase 1 验收报告与交接文档更新"
```

---

## Phase 1 验收标准

Phase 1 判定为完成，必须**同时**满足以下全部条件，且每条都有可复查的真实证据：

| # | 验收项 | 证据形式 |
| --- | --- | --- |
| 1 | `npm install` 在干净环境成功，无未处理的 peer 冲突 | 命令输出 |
| 2 | `npm run typecheck` 全仓库通过 | 命令 + 退出码 |
| 3 | `npm run lint` 全仓库通过 | 命令 + 退出码 |
| 4 | `npm run test` 全仓库通过，用例数 ≥ 45 | 各 workspace 摘要 |
| 5 | 服务端 E2E 覆盖：注册、重复用户名、弱密码、验证码失败、登录、错误密码、刷新轮换、复用检测、登出、封禁拦截、恢复码（成功/重放/大小写容错/无效码/撤销会话）、锁定 429、越权 403、IDOR 404、封禁/解封、审计 | 测试名称 + 结果 |
| 6 | 数据库：WAL、`busy_timeout=5000`、外键开启均被断言；migration 可重复执行；种子角色/权限幂等 | 测试名称 + 结果 |
| 7 | 服务端缺秘密/弱秘密/占位值时**拒绝启动**，且日志不泄露秘密值 | 手动命令输出 |
| 8 | 普通用户无法访问任何 `/admin/*`；降权后立即失效 | 测试名称 + 结果 |
| 9 | Web：注册→保存恢复码→登录→首页显示账号与设备会话→删除会话→登出→受保护路由跳转，全部实际跑通 | 手动验证记录（含实际结果） |
| 10 | Admin：管理员登录→检索用户→封禁（二次确认+原因）→审计可查；非管理员无法进入 | 手动验证记录 |
| 11 | Android：`gradlew assembleDebug` 成功，产出 APK（记录路径与大小）；jest 用例通过 | 命令输出 + APK 文件信息 |
| 12 | 仓库无秘密：`git status` 干净、无 `.env`/`data/`/密钥入库 | 命令输出 |
| 13 | `SECURITY-GUARDRAILS.md` 第 15.2/15.3 清单逐条核对完成 | 验收报告中的勾选表 |
| 14 | `HANDOFF.md`、`README.md`、`docs/*` 与实际实现一致（无过期描述） | 人工复核 |
| 15 | 未安装任何未经用户批准的额外系统软件/SDK/CLI | 验收报告声明 + 实际命令记录 |

## 明确不在 Phase 1 范围（避免误判为「未完成」）

- 文件上传与 `StorageProvider`（Phase 2 随宠物/头像资源实现）。
- 词库、单词学习、SM-2 复习（Phase 2）。
- 学习积分、金币、连续学习、Reward Ledger、宠物系统（Phase 3）。
- 听力、AI 口语、勋章与通知、离线同步、完整后台其余模块（Phase 4–7）。

以上推迟项必须在 `docs/phase-1-acceptance.md` 与 `HANDOFF.md` 中显式列出，不得含糊。

---

## 实施偏差记录（Implementation Deviations）

执行过程中与计划不同的地方，按「计划 → 实际 → 原因 → 证据」记录。文档与代码不一致时以代码为准，并回填本节。

| # | 计划 | 实际 | 原因与证据 |
| --- | --- | --- | --- |
| D1 | `tsconfig.base.json` 用 `module: CommonJS` + `moduleResolution: Node10` | 改为 `module: Node16` + `moduleResolution: Node16` + `isolatedModules: true` | TypeScript 6.0.3 已弃用 node10，实测报 `TS5107`（`npm run typecheck` 输出）；ts-jest 另要求 hybrid module 配置 `isolatedModules` |
| D2 | 共享包 `build` 直接 `tsc -p tsconfig.json` | 新增 `tsconfig.build.json`（`exclude: **/*.spec.ts`），`build` 指向它 | 测试文件位于 `src/`，直接以 `tsconfig.json` 构建会把 `*.spec.ts` 一起产出到 `dist/`；同时各包 `tsconfig.json` 需 `types: ["node","jest"]` 才能让 typecheck 识别 jest 全局 |
| D3 | 根 `build`/`test` 直接 `--workspaces` | 新增 `build:packages` 先按依赖顺序构建 `types → shared → core` | `npm --workspaces` 的执行顺序是 glob 顺序（apps 在前），会导致 `core` 在 `types` 之前构建而失败 |
| D4 | `normalizeRecoveryCode(' abcd-efgh ijkl ')` 期望 `ABCDEFGHIJKL` | 期望值改为 `normalizeRecoveryCode(' abcd-efgh jkmn ') === 'ABCDEFGHJKMN'` | 原计划两条用例互相矛盾：Crockford 易混字符映射要求 `I→1`、`L→1`，与「保留 IJKL」冲突。保留映射（生成的字表本就不含 I/L/O/U，映射仅帮助用户纠正误抄），修正该用例输入 |
| D5 | `validatePassword` 先判字符类别、后判常见弱密码 | 顺序改为**先判常见弱密码** | `password1234` 字符类别不足，原顺序会返回 `password_not_complex_enough`，与用例期望的 `password_too_common` 不符；先判常见弱密码对用户更有指导意义 |
| D6 | `ts-jest` 用 `^29.2.0` | 用 `^29.4.12` | 仅 29.4.x 声明支持 jest 30 与 TypeScript <7（`npm view ts-jest peerDependencies`） |
| D7 | 计划未提及 npm 安装脚本策略 | 记录：npm 11 默认拦截依赖的 postinstall 脚本（实测提示 `unrs-resolver@1.12.2 (postinstall)` 被忽略） | 属 npm 11 的安全默认行为，与安全红线一致；当前依赖链不需要构建脚本（better-sqlite3/@node-rs 均自带预编译产物） |
| D8 | 计划假定 NestJS 为 CommonJS | **NestJS 12 全系包为 ESM-only**（`@nestjs/common`、`core`、`platform-express`、`jwt` 的 package.json 均为 `"type": "module"`）。服务端仍以 CommonJS 产出（tsconfig `module: NodeNext` 且 apps/server 无 `type: module`），依赖 **Node 24 原生 `require(esm)`** 加载 Nest 包；Jest 必须用 `node --experimental-vm-modules …/jest.js` 运行 | 证据：不带 flag 时 `createRequireEsmError`（`@nestjs/testing/index.js` 为 ESM）；带 flag 后 2 个 suite / 8 个用例通过；`require('@nestjs/testing')` 在 Node 24.19 下直接可用。做法与 Nest 12 官方 TypeScript 模板一致（模板 test 脚本即 `node --experimental-vm-modules ./node_modules/jest/bin/jest.js`），其 tsconfig 亦为 `module: nodenext` |
| D9 | 计划未指定 `.env` 加载方式（原依赖清单含 `@nestjs/config`） | 不加 dotenv/@nestjs/config，改用 Node 24 原生 `node --env-file-if-exists=.env`（`start`/`start:dev` 脚本） | 减少一个依赖（供应链更小）；进程已有环境变量优先，符合部署直觉；生产可为 `.env` 设置严格文件权限 |
| D10 | 计划 `test` 直接用 `jest` | 改为 `node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --runInBand` | jest 被 npm workspaces 提升到根 `node_modules`，`apps/server/node_modules/jest` 不存在（实测 `Cannot find module`） |
| D11 | 计划未包含 `.env` 本地生成 | 本地开发 `.env` 用脚本生成随机 32 字节密钥（仅本地、已被 `.gitignore` 忽略） | 实测：直接复制 `.env.example` 会因占位秘密而**拒绝启动**（`配置校验失败: 环境变量 JWT_SECRET 长度不足 32 或仍为占位值`，退出码 1），属预期的安全行为 |
| D12 | `CONFIG` 提供者只放在 `AppModule.providers` | 新增 `@Global()` 的 `AppConfigModule` 并导出 `CONFIG`，由 `AppModule` 引入 | 实测报错 `Nest can't resolve dependencies of the DATABASE (?). Please make sure that the argument "CONFIG" ...`：跨模块（DatabaseModule/AuthModule）注入必须由全局模块导出 |
| D13 | 计划按 better-sqlite3 旧版 API 读取 PRAGMA 标量 | 新增 `readPragma()` 归一化：v13 的 `pragma()` 返回**行数组**（如 `[{"journal_mode":"wal"}]`），且 `busy_timeout` 的键名是 `timeout`；启动时新增 `busy_timeout=5000` 与外键生效断言 | 实测 `pragma('journal_mode')` 返回 `[{"journal_mode":"wal"}]`，直接 `String()` 得到 `[object Object]`，导致 WAL 断言误判 |
| D14 | `users.banned_by` 用内联 `references(() => users.id)` | 改为在表约束中用 `foreignKey({ name: 'users_banned_by_fk', ... }).onDelete('set null')` | 自引用导致 TS 循环推断：`TS7022 'users' implicitly has type 'any'`、`TS7024`。迁移文件已重新生成为单一 `0000_*.sql`（尚未发布，未违反「已发布迁移不可改」） |
| D15 | 未指定 migration 产物目录的清理策略 | schema 调整后删除 `drizzle/` 并重新生成，保证 Phase 1 只留下一个干净的首版迁移 | 避免在未发布的同一阶段堆叠修补型迁移（`0000` + `0001`） |
| D16 | 验证码直接使用 `req.ip` 绑定 | 新增 `common/net/ip.ts` 的 `normalizeIp()`，把 IPv4-mapped IPv6（`::ffff:127.0.0.1`）归一为 IPv4，签发与校验两侧都使用 | 实测注册返回 400：测试以 `127.0.0.1` 签发，服务端看到 `::ffff:127.0.0.1`，绑定不一致。该归一化同时避免同一客户端在限流计数中被算作两个来源 |
| D17 | 测试用 `app.get(ChallengeCaptchaProvider)` 取验证码 Provider | 改为 `app.get<ChallengeCaptchaProvider>(CAPTCHA_PROVIDER)` | 该 Provider 以令牌 `CAPTCHA_PROVIDER` 通过 `useFactory` 注册，类本身不是 Provider（实测 `Nest could not find ChallengeCaptchaProvider element`） |
| D18 | 用 `Algorithm.Argon2id` 指定算法 | 改用数值 `2`（附注释） | `@node-rs/argon2` 的 `Algorithm` 是 ambient const enum，`isolatedModules: true` 下不可访问（实测 `TS2748`） |
| D19 | `RoleRepository` 含 `canAssignRole` | Phase 1 未实现该方法（无调用方），改为在 Drizzle 实现中提供 `hasRole` 供后续权限管理使用 | 避免出现无调用方的接口方法（YAGNI）；如后续需要角色授予权限校验再补 |
| D20 | 计划测试期望「封禁后 `/auth/me` 返回 403」 | 实际为 **401**（测试已按实际行为修正） | 封禁会撤销该用户全部会话，旧 access token 对应的会话已不存在，认证守卫先于用户状态检查判定 token 无效。401 也更少泄露「账号被封禁」这一信息 |
| D21 | 计划中的封禁不存在用户测试用 `reason: 'x'` | 改为合法原因后再断言 404 | `reason` 有 `MinLength(2)` 的 DTO 校验，非法原因会先返回 400，无法到达 404 分支 |
| D22 | 未明确引导管理员的恢复码 | 引导管理员**不生成恢复码**，脚本会打印提示 | 保持脚本简单且不把任何凭证写入终端输出；替代路径：先用注册流程创建账号再由后台授予 admin。已记入 `HANDOFF.md` 技术债 |
| D23 | 计划含 `endpoints/user.endpoints.ts`（调用 `/users/me`） | **删除该文件**，`ApiClient` 只暴露 `health`/`auth`/`admin` | 服务端并不存在 `/users/me` 端点，保留即为「指向不存在接口的死代码」；Phase 2 需要时再按真实端点添加 |
| D24 | `packages/auth` 依赖 `@leximochi/api-client` | 去掉该依赖，只依赖 `@leximochi/types`（通过 `SessionClient` 结构化接口解耦） | 会话管理器只依赖接口契约，不依赖具体客户端实现；这样 Web/Admin/Mobile 可注入各自客户端，也避免多余依赖 |



