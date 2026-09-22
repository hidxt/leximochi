# Leximochi 交接文档（HANDOFF）

> **本文件是「当前状态快照」，不是开发流水账。** 新 Agent 读完 `开发提示词.md`、`SECURITY-GUARDRAILS.md` 和本文件后，应能安全继续开发。
> 历史细节交给 Git；已解决的问题从「已知问题」中移除，不要无限累积。
> **禁止在本文件中写入任何密码、Token、API Key、恢复码、主密钥或其他秘密信息。**
> 若本文件与真实代码、Git 状态或实际测试结果不一致，以真实代码/Git/测试为事实来源，并修正本文件。

- 快照时间：2026-09-22
- 当前阶段：**Phase 1 全部 15 个任务的实现已完成**（含四端与验收文档），等待用户确认是否进入 Phase 2
- 当前可运行端：**服务端 + Web + Admin**（均已浏览器实测）；**Android 已通过构建验证**（产出 debug APK，未做设备运行验证）

---

## 1. 开工必读（所有 Agent / 子 Agent）

1. `开发提示词.md` —— 需求、产品设计、技术架构、开发规则、安全约束的**主要基线**（不得自行修改，见第 12 节）。
2. `SECURITY-GUARDRAILS.md` —— 全项目安全红线，优先级仅次于 `开发提示词.md`。
3. `HANDOFF.md`（本文件）—— 当前真实状态。
4. `docs/architecture.md`、`docs/database-design.md`、`docs/plans/2026-09-21-phase-1-foundation.md`（Phase 1 逐任务计划 + **实施偏差记录**）。

---

## 2. Git 状态

| 项 | 实际值 |
| --- | --- |
| 仓库根目录 | `C:\Users\auzasr\Documents\Projects\leximochi`（唯一项目目录） |
| 当前分支 | `main` |
| 上游 | `origin/main`（`git@github.com:hidxt/leximochi.git`，SSH） |
| 最近 commit | `819d59a docs: 补充 Android 构建文档并明确密钥规则` |
| 完整历史 | `819d59a` → `f5e25ba` → `5316c25` → `1e521d6`（mobile）→ `434d50c`（admin）→ `2481677`（web）→ `3c5776b` → `2b3dba5`（api-client/auth）→ `4919082`（RBAC/后台）→ `8d33d5d`（限流）→ `055ea23`（恢复码）→ `1fd09e7` → `ce53d73`（登录/会话）→ `b5ca547`（注册）→ `f94a7bf`（数据库）→ `4a96e7d`（服务端骨架）→ `f575beb`（core/shared）→ `16097b3`（types）→ `0904604`（Monorepo）→ `6689da0`（架构与计划）→ `7368587` → `714fac7`（安全红线/交接）→ `8649e27`（Initial commit） |
| 本地备份引用 | `tag pre-mobile-history-cleanup-20260922`、`branch backup/pre-mobile-cleanup-20260922`（保留历史清理前的旧提交，含被移除的 gitlink 提交；确认无误后可删除） |
| 工作区 | 干净（`git status` 无未提交改动） |
| 远端 | `origin/main`；本地领先，push 状态见下文「Push 记录」 |
| 许可证 | Apache-2.0（`LICENSE`） |

---

### 2.1 Git 历史清理记录（2026-09-22，用户已批准）

RN CLI 在 `apps/mobile` 内自行执行了 `git init`，导致首次提交 `c67d96a` 只记录了一个**嵌套仓库引用（gitlink）**而非真实文件。

| 项 | 内容 |
| --- | --- |
| 备份 | 清理前 HEAD `2f5e948`；已建 tag `pre-mobile-history-cleanup-20260922` 与分支 `backup/pre-mobile-cleanup-20260922` |
| 处理 | 脚本化 `git rebase -i 434d50c`，把 `523fd24`（写入 42 个真实文件、删除 gitlink）标记为 `fixup` 合并进 `c67d96a` |
| 结果 | 提交数 4 → 3：`c67d96a` + `523fd24` → 单一提交 `1e521d6`（含真实文件与文档，无 gitlink） |
| 内容校验 | `git diff backup/pre-mobile-cleanup-20260922 HEAD` → **无任何差异**（未丢失文件或代码） |
| 结构校验 | `HEAD` 树中 gitlink 数 0；无嵌套 `.git`、无 `.gitmodules`、`git submodule status` 为空；`apps/mobile` 跟踪文件 42 个 |
| gitlink 残留位置 | 仅存在于备份引用指向的旧提交中（`c67d96a`），主干不可达 |
| 回归验证 | 清理后重跑 `typecheck`/`lint`/`test`/`build` 全部 exit 0，121 个用例通过（与清理前一致） |

## 3. 当前目录结构（仅列已存在内容）

```
leximochi/
├── apps/
│   └── server/                     # NestJS 12 + SQLite（唯一可运行端）
│       ├── drizzle/                # 0000_real_steve_rogers.sql + meta/（首版迁移，已应用）
│       ├── drizzle.config.ts
│       ├── src/
│       │   ├── main.ts             # helmet、cookie-parser、CORS 白名单、ValidationPipe、优雅关闭
│       │   ├── app.module.ts       # 全局守卫顺序：Throttler → CsrfOrigin → JwtAuth
│       │   ├── config/             # configuration.ts（启动期校验）、config.module.ts（@Global 导出 CONFIG）
│       │   ├── common/             # errors/、filters/、guards/、middleware/、decorators/、net/ip.ts
│       │   ├── database/           # database.service.ts、migrate.ts、schema/（7 文件 10 表）、seed/、repositories/（5 个 Drizzle 实现）
│       │   └── modules/            # health/、auth/（captcha/、domain/、dto/）、users/、audit/
│       └── test/                   # 8 个测试文件 + helpers/
├── packages/
│   ├── types/                      # 错误码、权限键、限额、认证 DTO 契约
│   ├── core/                       # 用户名/密码/恢复码纯规则
│   ├── shared/                     # 设计 Token
│   ├── api-client/                 # 类型安全 HTTP 客户端（auth/admin 端点 + ApiError）
│   └── auth/                       # 会话状态机与 SessionStore 抽象
├── docs/                           # architecture.md、database-design.md、plans/
├── scripts/verify-workspaces.mjs
├── package.json / tsconfig.base.json / eslint.config.mjs
└── .env.example / .gitignore / .gitattributes
```

尚未创建（计划中）：`apps/web`、`apps/admin`、`apps/mobile`、`packages/api-client`、`packages/auth`、`data/`（运行期自动创建）、`README` 之外的部署文档。

---

## 4. 技术栈与实际版本（均已安装并实测可用）

| 组件 | 版本 | 备注 |
| --- | --- | --- |
| Node.js | v24.19.0 | 满足 RN `^24.3.0` 与 Nest `>=20` |
| npm | 11.17.0 | npm workspaces；**默认拦截依赖 postinstall 脚本**（实测 `unrs-resolver`、`esbuild` 被忽略） |
| TypeScript | 6.0.3 | `module/moduleResolution: Node16`（TS 6 已弃用 node10）、`isolatedModules: true` |
| 服务端 | NestJS 12.0.4 | **ESM-only 包**：服务端产出 CJS，靠 Node 24 原生 `require(esm)` 加载；Jest 需 `node --experimental-vm-modules` |
| 数据库 | better-sqlite3 13.0.3 + drizzle-orm 0.45.3 | 包内自带 N-API 预编译产物，无需编译 |
| 迁移 | drizzle-kit 0.31.11 | `npm run db:generate -w @leximochi/server` |
| 密码哈希 | @node-rs/argon2 2.2.1 | Argon2id；`Algorithm` 是 ambient const enum → 代码中用数值 `2` |
| 校验 | class-validator 0.15.1 + class-transformer 0.5.1 | 全局 `ValidationPipe`（白名单 + 禁止未声明字段） |
| 测试 | Jest 30.5.2 + ts-jest 29.4.12 + supertest 7.2.2 | 服务端 8 个 suite / 47 个用例 |
| JDK / Android SDK | JDK 17.0.20.1；compileSdk 37 / buildTools 37.0.0 / NDK 27.1.12297006 | 版本匹配 RN 0.87.1，**无需补装 SDK 组件** |

---

## 5. 数据库与 Migration 状态

- 数据库：SQLite，路径来自 `DATABASE_PATH`（本地默认 `apps/server/data/db/leximochi.sqlite`，`data/` 不入 Git）。
- 连接参数（启动时设置并**断言生效**）：`journal_mode=WAL`、`busy_timeout=5000`、`foreign_keys=ON`、`synchronous=NORMAL`。
- Migration：首版 `apps/server/drizzle/0000_real_steve_rogers.sql`，启动时自动执行未应用迁移（`runMigrations`）。
- 表（10 张）：`users`、`roles`、`permissions`、`role_permissions`、`user_roles`、`sessions`、`recovery_codes`、`auth_attempts`、`captcha_challenges`、`audit_logs`（+ drizzle 自己的 `__drizzle_migrations`）。
- 种子数据：角色 `user`/`admin`；权限 `admin.users.read`、`admin.users.ban`、`admin.audit.read`（幂等写入）。
- ER 与字段说明见 `docs/database-design.md`。

---

## 6. 已实现的 API（Phase 1 当前状态）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/health` | 公开 | 存活检查 |
| POST | `/auth/captcha` | 公开 | 签发算术挑战（HMAC 签名、TTL 120s、一次性、绑定 IP） |
| POST | `/auth/register` | 公开 | 注册，返回用户与一次性 10 个恢复码 |
| POST | `/auth/login` | 公开 | Web 走 Cookie / 移动端（`x-client-type: mobile`）走 Body |
| POST | `/auth/refresh` | 公开（凭证） | Refresh 轮换 + 复用检测 |
| POST | `/auth/logout` | 需登录 | 撤销当前会话 |
| POST | `/auth/logout-all` | 需登录 | 撤销该用户全部会话 |
| GET | `/auth/me` | 需登录 | 当前用户与权限列表 |
| GET | `/auth/sessions` | 需登录 | 活跃会话列表（含 `isCurrent`） |
| DELETE | `/auth/sessions/:id` | 需登录 | 删除自己的会话（他人会话返回 404） |

**尚未实现**：`/auth/recovery`（恢复码重置）、`/admin/*`（RBAC 与后台接口）。

响应格式：成功 `{ data: ... }`；失败 `{ error: { code, message, requestId } }`，`code` 取自 `@leximochi/types` 的 `ErrorCode`。

---

## 7. 各端可运行状态

| 端 | 状态 |
| --- | --- |
| `apps/server` | ✅ 可运行：`npm run build -w @leximochi/server` 后 `node --env-file-if-exists=.env dist/main.js`；实测 `/health` 200、404 统一错误格式、helmet 安全头齐全、自动建库并生成 WAL；另实测 `create-admin` 脚本三条路径 |
| `apps/web` | ✅ 可运行：`npm run dev -w @leximochi/web`（5173）；已实测注册（含恢复码保存确认）→ 登录 → 刷新恢复会话 → 登出，控制台无错误 |
| `apps/admin` | ✅ 可运行：`npm run dev -w @leximochi/admin`（5174）；已实测管理员登录、用户检索、封禁（二次确认+原因）、审计日志、非管理员被拒 |
| `apps/mobile` | ✅ 可构建：`npm run build:android -w @leximochi/mobile` → `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`（约 117 MB，含 4 ABI）。**未做运行验证**（本机无 AVD / 无真机） |
| `packages/api-client`、`packages/auth` | ✅ 已实现并有单测（分别为 7、5 个用例）；尚未被任何前端消费 |

---

## 8. 已完成 / 进行中 / 未完成

### 已完成（对应计划 Task 1–11）
- Monorepo 地基：npm workspaces、TS 6 基座、ESLint/Prettier、`.gitignore`/`.gitattributes`/`.env.example`、workspaces 校验脚本、README。
- `@leximochi/types`（错误码/权限/限额/DTO 契约）、`@leximochi/core`（用户名/密码/恢复码规则）、`@leximochi/shared`（设计 Token）。
- 服务端骨架：启动期配置校验（缺失/过短/占位秘密 → 拒绝启动）、统一错误响应（不泄露堆栈/路径）、helmet、CORS 白名单、CSRF Origin 校验、请求 ID、`/health`。
- 数据库层：10 张表 schema、首版迁移、WAL/busy_timeout/外键断言、仓储接口 + Drizzle 实现、事务辅助、审计服务。
- 注册：验证码抽象与实现、Argon2id、恢复码哈希入库、失败补偿、审计。
- 登录与 Token：JWT access token、refresh 轮换与复用检测、登出/退出全部设备/设备会话管理、全局认证守卫（权限每请求读库）。
- 恢复码：`/auth/recovery` 一次性重置密码（先校验密码强度再消费恢复码、成功后撤销全部会话并整组重发、条件更新防重放）。
- 限流与锁定：登录按用户名与 IP 双维度计数、注册/恢复码/验证码分别限流、达阈值 429 + 审计。
- RBAC 与后台：`PermissionsGuard` + `/admin/users`（检索/分页/封禁/解封）+ `/admin/audit-logs` + `create-admin` 脚本。
- API SDK：`@leximochi/api-client`（ApiError 解包、鉴权头、401 回调）与 `@leximochi/auth`（会话状态机）。

### 进行中
- 计划 Task 12 起：三端骨架与验收。

### 未完成（Phase 1 剩余）
1. `apps/web`（注册/登录/受保护首页/设备会话管理）。
2. `apps/admin`（管理员登录、用户列表、封禁二次确认、审计日志）。
3. `apps/mobile`（RN 0.87.1 登录界面、Metro monorepo 配置、Gradle 代理、APK 构建验证）。
4. Phase 1 验收报告（`docs/phase-1-acceptance.md`）、`docs/api.md`、发布前安全自检。

### Phase 2–7
全部未开始（词库与复习、宠物闭环、听力、AI 口语、勋章、离线同步与发布）。

---

## 9. 实际执行的命令与真实结果（截至本次快照）

### 全仓库
| 命令 | 结果 |
| --- | --- |
| `npm install` | 成功（root + 全部 workspace） |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0：服务端 77、core 15、api-client 7、auth 5、types 3（合计 **107 个用例**） |
| `npm run build` | exit 0 |

### 服务端专项
| 命令 | 结果 |
| --- | --- |
| `npm run build -w @leximochi/server` | exit 0，产出 `dist/main.js`（CJS） |
| `npm test -w @leximochi/server` | 13 suites / 77 tests 全通过（验证码 6、注册 7、登录 12、会话 4、Token 5、数据库 5、配置 6、健康 2、恢复码 8、限流 5、锁定 4、后台权限 5、后台管理 8） |
| `create-admin` 脚本实测 | 首次创建成功（仅输出用户名）；重复执行未加 `--allow-existing` 退出码 1；缺 `ADMIN_PASSWORD` 打印用法退出码 1；库内确认 admin 角色与 `admin.bootstrap.created` 审计 |
| `npx drizzle-kit generate`（apps/server） | 生成 `drizzle/0000_real_steve_rogers.sql`（10 表 / 9 外键 / 全部索引） |
| 启动实测（本地随机密钥 `.env`） | `/health` → 200；未知路由 → 404 统一格式；CSP/nosniff/X-Frame-Options/x-request-id 均存在；自动创建 `data/db/leximochi.sqlite` + `-wal`/`-shm`；只读连接确认 `journal_mode=wal` |
| 启动实测（占位秘密） | **拒绝启动**：`配置校验失败: 环境变量 JWT_SECRET 长度不足 32 或仍为占位值`，退出码 1，日志不含秘密值 |

### 网络实测（用于依赖与构建）
- 代理 `127.0.0.1:10808` 访问 GitHub：200；**直连 GitHub HTTPS 超时**；GitHub SSH 直连可用（remote 为 SSH）。
- `repo.maven.apache.org` 直连超时（后续 Android 构建需项目内代理配置）；`dl.google.com`、`services.gradle.org` 直连可用。
- npm registry 使用现有 `registry.npmmirror.com`（未修改全局配置）。

---

## 10. 已确认的关键架构决策及原因

基线决策（来自 `开发提示词.md`）与用户确认项见 `HANDOFF` 历史与 `docs/plans/…` 的偏差表。当前生效的关键决策：

| 决策 | 原因 |
| --- | --- |
| 统一 TypeScript / npm workspaces / Monorepo | 基线要求，不引入 pnpm/Bun/Turborepo |
| NestJS 12 + SQLite（Drizzle + better-sqlite3） | 用户确认；SQLite 需精确控制 PRAGMA 与事务，且依赖无需本机编译 |
| 服务端以 CJS 产出、依赖 Node 24 `require(esm)` 加载 Nest 12 ESM 包 | Nest 12 全系 ESM-only；与官方 TS 模板一致 |
| `.env` 用 Node 原生 `--env-file-if-exists`，不引入 dotenv/@nestjs/config | 减少依赖；进程环境变量优先 |
| Refresh Token 用 HMAC-SHA256 + 服务端 pepper 存储；恢复码/密码用 Argon2id | 前者高熵无需慢哈希，后者低熵必须抗离线爆破 |
| 权限每请求从数据库读取 | 封禁/降权立即生效，不依赖 token 过期 |
| 敏感凭证传输：Web = HttpOnly Cookie（仅 `/auth` 路径），移动端 = Body | 降低 XSS 窃取面；CSRF 由 Origin 白名单 + SameSite 兜底 |
| Web/Admin/Mobile 不复制业务与结算规则 | 服务端为唯一权威方 |

---

## 11. 已知 Bug / 技术债 / 风险 / 阻塞项

### Bug
- 无已知功能缺陷（当前实现全部有测试覆盖且通过）。

### 已定的密钥规则（用户决定，2026-09-22）
- 任何 `*.keystore` / `*.jks` **一律不入库，不设例外**（含 RN 模板的公开调试密钥 `android/app/debug.keystore`）；发布签名密钥永不入库。
- 全新克隆后按 `docs/android-build.md` 第 2 节的 `keytool` 命令在本地生成调试密钥即可完成 Debug 构建；`apps/mobile/.gitignore` 注释中保留了同一命令。

### 技术债
1. `ChallengeCaptchaProvider` 的「已消费挑战」用**进程内 Set** 记录，多实例部署会失效（表 `captcha_challenges` 已建好，届时改用它）。
2. `req.ip` 直接使用；**部署到反向代理后必须配置 `trust proxy`**，否则限流与验证码绑定会以代理 IP 为准（Phase 7 部署文档需写清）。
3. `IP` 与 `user_agent` 原样存库用于安全审计，**尚未实现保留期与清理策略**。
4. 全局限流仍是 `@nestjs/throttler` 默认内存存储（120 req/min/IP），未与 `auth_attempts` 联动。
5. npm 11 默认拦截依赖 postinstall：esbuild 的 postinstall 被忽略；若后续 Vite/Vitest 因二进制缺失失败，需告知用户并取得同意后再处理（不得静默 `npm approve-scripts`）。

### 风险
| 风险 | 影响 | 现状 |
| --- | --- | --- |
| Nest 12 ESM + Jest 组合较新 | 新测试文件若忘记 `--experimental-vm-modules` 会报 `createRequireEsmError` | 脚本已固化；README/HANDOFF 记录 |
| Android 首次构建需下载 Gradle 9.4.1 与全部依赖 | 耗时长（预计 >10 分钟） | 未开始；`servicess.gradle.org` 直连可达 |
| Maven Central 直连不可达 | Android 构建拉依赖失败 | 计划：项目内 `gradle.properties` 代理配置（Task 14） |
| 无 AVD / 无连接设备 | Android 仅能做「可构建」验证 | 用户已确认按此范围验收 |
| 未 push 到远端 | 仅本地存在 | 由用户决定何时推送 |

### 阻塞项
- 无硬阻塞。

---

## 12. `开发提示词.md` 修改请求流程

`开发提示词.md` 是主要基线但**不得由 Agent 自行修改**。发现技术错误、过时内容、内部冲突、不可实现要求或更可靠替代方案时：说明「原规则 / 问题 / 依据 / 不修改的影响 / 建议内容 / 影响范围」，等待用户明确批准后再改；涉及安全要求时同步更新 `SECURITY-GUARDRAILS.md`。

当前状态：**未发现需要修改的条目**。

---

## 13. 环境依赖与安装规则（长期生效）

- **允许**：项目目录内通过 `npm` 安装正常项目依赖，无需逐次询问。
- **必须先申请并等待用户明确命令**：pnpm、Bun、Yarn、Python 包、Docker、Visual Studio、CMake、新 JDK、额外 Android SDK 平台/系统镜像/构建工具、模拟器镜像、全局 CLI、winget/Chocolatey/Scoop 等系统包管理器、任何安装器或下载脚本。申请须说明：缺什么、为什么需要、计划版本、来源、用途、磁盘/系统影响、替代方案。
- **禁止**擅自修改系统级或全局配置；**禁止**为开发速度绕过 `SECURITY-GUARDRAILS.md`。

---

## 14. GitHub 网络操作规则（长期生效）

- 本地 `git commit` 不需要网络。
- GitHub 网络操作（clone/fetch/pull/push/API）**优先代理 `127.0.0.1:10808`**（当前命令/进程/仓库范围配置）。
- 代理不可用时自动切直连；均失败则报告实际错误与已尝试方法，**禁止无限重试**。
- 本仓库 remote 为 SSH 且直连可用；HTTPS 直连 GitHub 实测超时。
- 禁止擅自永久修改全局代理配置。

---

## 15. 危险操作约束（长期生效）

- 未经明确授权禁止：`git reset --hard`、force push、重写历史、删除分支/标签、`git clean -fdx`、大规模删除仓库文件、`--no-verify`。
- 破坏性 Git 操作前先 `git status` 并保护未提交改动。
- 禁止提交秘密、数据库文件、`data/`、日志、构建产物（已由 `.gitignore` 覆盖，仍需提交前复核）。
- 提交使用 Conventional Commits，保持提交小而聚焦。

---

## 16. 下一步任务优先级

1. **计划 Task 12**：`apps/web`（Vite + React 19.2.3；注册/登录/受保护首页/设备会话管理；使用 `design-tokens` 与 frontend-design 规范，不建空占位页）。
2. **计划 Task 13**：`apps/admin`（独立后台：管理员登录、用户检索、封禁二次确认、审计日志；端口 5174）。
3. ~~计划 Task 14~~ ✅：`apps/mobile` 完成 RN 0.87.1 初始化、workspace 改造、Metro monorepo 配置、Gradle 项目内代理与两处 monorepo 路径适配；`assembleDebug` 成功产出 APK。
4. **计划 Task 15**：全量验收、安全自检、`docs/phase-1-acceptance.md`、`docs/api.md`、本文件最终更新。

执行每一步时请对照 `docs/plans/2026-09-21-phase-1-foundation.md` 的任务步骤与验收标准，并把新的实施偏差追加到该文件的「实施偏差记录」。

---

## 17. 本文件维护规则

- 每完成重要 Task、Phase、数据库 migration、重大架构调整、重要依赖变更或发现重大风险后立即更新。
- 每个 Phase 结束前、以及准备结束当前会话前必须检查并更新。
- 保持「当前状态快照」形态：已解决的问题移出「已知问题」，历史交给 Git。
- 所有条目必须与真实代码、Git 状态、实际测试结果一致；**禁止**在没有实际证据时写「已完成」或「测试通过」。
- 禁止写入任何秘密信息。
