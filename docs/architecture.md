# Leximochi 架构方案

> 基线：`开发提示词.md`（需求与约束）、`SECURITY-GUARDRAILS.md`（安全红线）、`HANDOFF.md`（当前状态）。
> 本文件描述**架构与目录规划**，与真实代码保持一致；实现变化时同步更新。

- 版本：v1（Phase 1 基线）
- 更新：2026-09-21
- 状态：Phase 1 生效中

---

## 1. 产品与系统边界

Leximochi 是「英语学习 + 宠物陪伴养成」产品，核心循环：学习 → 获得学习积分/金币/宠物 EXP → 宠物成长 → 解锁动作/勋章/称号 → 继续学习。

V1 提供四个可运行端：

| 端 | 目录 | 用户 |
| --- | --- | --- |
| 用户 Web | `apps/web` | 普通用户 |
| Android App | `apps/mobile` | 普通用户 |
| 管理后台 | `apps/admin` | 管理员（与普通用户权限严格分离） |
| 服务端 | `apps/server` | 为以上三端提供 API |

未来预留 Windows 客户端（React Native Windows 或其它实现），V1 不开发。

**V1 不做**：好友、排行榜、私聊、社区、动态、金币充值、多宠物、宠物房间装修、复杂换装、Live2D、完整 CET 阅读/写作/翻译模考、iOS、Windows 客户端。

---

## 2. 技术栈（版本已核验，见 `HANDOFF.md` 第 10.2 节）

| 层 | 选型 |
| --- | --- |
| 语言 | TypeScript 6.0.3（全仓库统一） |
| 运行时 | Node.js 24（≥ 24.3.0） |
| 包管理 | npm 11 + workspaces |
| 服务端 | NestJS 12.0.4（Express 平台） |
| 数据库 | SQLite（WAL + `busy_timeout` + 外键 + 事务），Drizzle ORM 0.45.3 + better-sqlite3 13.0.3 |
| Migration | drizzle-kit 0.31.11 生成 SQL + 自建 migration 运行器 |
| 密码哈希 | Argon2id（`@node-rs/argon2` 2.2.1） |
| 认证 | Access Token（JWT HS256，短时效）+ Refresh Token（不透明随机串，服务端哈希存储 + 轮换 + 复用检测） |
| Web / Admin | React 19.2.3 + Vite 8.3.0 |
| Android | React Native 0.87.1（compileSdk 37 / targetSdk 36 / minSdk 24 / NDK 27.1.12297006，New Architecture + Hermes） |
| 测试 | 服务端 Jest 30 + supertest；Web/Admin Vitest 5；Mobile Jest（RN preset） |
| 部署 | 直接 Node.js 运行（不依赖 Docker），Linux 生产后续提供 systemd 示例 |

---

## 3. Monorepo 目录规划

```
leximochi/
├── apps/
│   ├── server/        # NestJS 服务端（唯一权威业务与结算方）
│   ├── web/           # 用户 Web（React + Vite）
│   ├── admin/         # 管理后台（React + Vite，独立构建与部署）
│   └── mobile/        # React Native Android
├── packages/
│   ├── types/         # 共享类型、DTO 契约、错误码、领域枚举（零运行时依赖）
│   ├── core/          # 纯业务规则（无 IO：输入校验、恢复码生成/解析、时间与幂等工具）
│   ├── api-client/    # 类型安全 HTTP 客户端（fetch 抽象，Web/RN/Admin 共用）
│   ├── auth/          # 客户端会话状态机与凭证存储抽象（Web/RN 共用的“非秘密”逻辑）
│   └── shared/        # 设计 Token、通用工具、常量
├── data/              # 运行期数据（不入 Git）：db / uploads / audio / pets / backups / logs
├── docs/              # 架构、数据库、API、开发环境、部署、备份恢复、安全、素材许可证
│   └── plans/         # 分阶段实施计划与验收标准
├── .env.example       # 仅占位符
├── .gitignore
├── .gitattributes
├── package.json       # npm workspaces 根
└── README.md
```

### 3.1 为什么暂不创建 `packages/ai` 与 `packages/sync`

基线建议的 `ai`、`sync` 包**推迟到对应 Phase**（Phase 5 AI 口语、Phase 7 离线同步）创建，理由：Phase 1 若只创建空接口而无真实调用方，属于「提前实现未来功能 / 无意义抽象」，违反基线的 YAGNI 要求。届时创建不会影响现有包结构，因为它们只依赖 `types`。

### 3.2 为什么不共用 UI

基线要求：**不强制** Web 与 React Native 共用 UI。共享的是业务逻辑、类型、API SDK、学习算法与设计 Token；平台 UI 按各自交互习惯实现。`packages/shared` 只放设计 Token（颜色、间距、字号、动画时长），不放组件。

---

## 4. 服务端模块划分（`apps/server/src`）

```
src/
├── main.ts                     # 引导：安全头、全局管道/过滤器、优雅关闭
├── app.module.ts               # 根模块装配
├── config/
│   ├── env.schema.ts           # 环境变量解析与校验（启动即失败）
│   └── configuration.ts        # 强类型配置对象
├── common/
│   ├── errors/                 # AppError 体系与 ErrorCode 映射
│   ├── filters/                # 全局异常过滤器（不泄露堆栈/路径/秘密）
│   ├── decorators/             # @CurrentUser / @RequirePermissions / @Public
│   ├── guards/                 # 认证守卫、权限守卫
│   └── interceptors/           # 统一响应、请求上下文（requestId）
├── storage/                    # 文件存储：StorageProvider 接口 + 本地实现 + 上传安全校验
├── database/
│   ├── connection.ts           # better-sqlite3 + PRAGMA + WAL
│   ├── schema/                 # Drizzle 表定义（按领域分文件）
│   ├── migrate.ts              # migration 运行器（启动时校验版本）
│   ├── transaction.ts          # 事务辅助
│   └── repositories/           # 仓储的 Drizzle 实现
└── modules/
    ├── health/                 # 存活与就绪检查（Phase 2 追加 vocabulary / review / study）
    ├── auth/                   # 注册、登录、刷新、登出、恢复码、验证码
    ├── users/                  # 用户资料与状态（含封禁）
    ├── audit/                  # 审计日志服务（管理员操作与敏感认证事件）
    └── admin/                  # 后台接口（用户查询、封禁/解封、审计查询）
```

后续 Phase 追加：`vocabulary`、`review`、`study-plan`、`rewards`、`pets`、`achievements`、`listening`、`speaking`、`ai-config`、`sync`。

### 4.1 分层与解耦规则

- Controller 只做「解析请求 → 调用 Service → 返回 DTO」，不含业务规则。
- Service 承载业务规则，**只依赖仓储接口**（如 `UserRepository`），不直接依赖 Drizzle。
- 仓储接口定义在模块内（`modules/*/domain/*.repository.ts`），Drizzle 实现放在 `database/repositories/`，通过 DI token 绑定。这样未来换数据库只需替换实现。
- `packages/core` 中的纯函数被 Service 复用（服务端与客户端共享同一套规则，避免算法复制到 Web/Mobile/Admin）。

---

## 5. 认证与会话设计

### 5.1 Token 模型

| 凭证 | 形式 | 时效 | 存储 |
| --- | --- | --- | --- |
| Access Token | JWT（HS256），载荷 `sub`(userId)、`sid`(sessionId)、`roles`、`iat`/`exp`、`jti` | 15 分钟 | 客户端内存；Web 亦可放置于 HttpOnly Cookie 方案（见 5.3） |
| Refresh Token | 不透明随机串（32 字节，base64url），**服务端只存 HMAC-SHA256(串, 服务端密钥)** | 30 天（滑动） | Web/Admin：HttpOnly Cookie；Android：系统安全存储（Phase 7 完善） |

Refresh Token 用 HMAC 而非 Argon2id 的理由：它是高熵随机串（256 bit），不存在字典攻击面，慢哈希只会拖慢每次刷新；加服务端 pepper 保证「仅泄漏数据库不足以伪造」。**恢复码与密码**属低熵或用户输入，必须用 Argon2id。

### 5.2 会话与轮换

- 每次登录创建一个会话（`sessions` 行）并属于一个 `familyId`。
- 刷新时：旧 Refresh Token 立即失效，签发新的（轮换）。
- **复用检测**：若收到已撤销/已轮换的 Refresh Token，视为凭证泄漏，撤销该 `familyId` 下全部会话并写审计事件。
- 登出：撤销当前会话；支持「退出全部设备」。
- 封禁/改密/使用恢复码：撤销该用户全部会话（避免旧凭证继续有效）。

### 5.3 Web 凭证承载

Web/Admin 使用 **HttpOnly + Secure + SameSite=Lax Cookie** 承载 Refresh Token，Access Token 仅存内存（不落 localStorage）。由于使用 Cookie，状态变更接口必须做 CSRF 防护：校验 `Origin`/`Referer` 白名单（与 CORS 白名单同源配置）。Android 端使用 Body 传 Refresh Token（无 Cookie，不适用 CSRF）。

### 5.4 人机验证抽象

`CaptchaProvider` 接口：`issue()` 返回挑战、`verify(token, context)` 返回结果。

- Phase 1 实现 `ChallengeCaptchaProvider`：服务端签发算术挑战并用服务端密钥 HMAC 签名，含 TTL 与绑定上下文，校验后凭 `jti` 入库防重放。
- 未来实现 `TurnstileCaptchaProvider`：通过配置切换，业务代码不变。
- **生产环境若未配置真实 Provider，必须显式告警**（记录在 `HANDOFF.md` 风险中），不得静默视为「已验证」。

---

## 6. 权限模型（RBAC）

- `roles`（如 `user`、`admin`）与 `permissions`（如 `admin.users.read`、`admin.users.ban`、`admin.audit.read`）多对多关联。
- 每个需要权限的接口用 `@RequirePermissions('admin.users.read')` 声明，由全局权限守卫校验；**服务端二次校验，前端隐藏按钮不构成权限控制**。
- 管理员与普通用户属不同身份域：后台接口对普通用户返回 403，且不泄露资源是否存在。
- 高风险操作（封禁/解封、权限变更、奖励规则、删除资源）写审计日志。

---

## 7. 数据访问与完整性

- 连接建立时立即设置：`journal_mode=WAL`、`busy_timeout`（5s）、`foreign_keys=ON`、`synchronous=NORMAL`。启动时断言实际生效值。
- 所有写操作在事务内完成；幂等以**唯一约束**兜底（不使用「先查后写」）。
- 时间统一存 UTC 毫秒整数；服务端生成时间，不采信客户端时间做业务判定。
- ID 使用 UUID v4（`node:crypto`），避免自增 ID 带来的枚举与归属猜测风险。
- Migration 通过 drizzle-kit 生成 SQL 文件入库，应用启动时校验并执行未应用的 migration；结构变更只允许通过 migration 进行。

---

## 8. 错误模型与可观测性

统一响应：

```json
{ "error": { "code": "AUTH_INVALID_CREDENTIALS", "message": "用户名或密码不正确", "requestId": "..." } }
```

- `code` 由 `packages/types` 中的 `ErrorCode` 枚举集中定义，客户端据此做分支。
- 错误信息**不包含**堆栈、SQL、SQLite 路径、文件系统结构、环境变量、Token、API Key。
- 每个请求生成 `requestId`，写入日志与审计，便于排查；日志统一脱敏（Authorization、Cookie、密码、恢复码、Token、Key 字段）。
- 审计日志记录：谁、何时、对什么对象、做了什么、结果、来源 IP/UA。

---

## 9. 客户端架构

| 端 | 结构 |
| --- | --- |
| Web | Vite + React；路由、受保护路由、`packages/api-client` 调接口；服务端状态用最小自研 hook（不引入重型状态库，YAGNI） |
| Admin | 与 Web 完全分离的独立应用与独立构建产物；仅管理员可登录；高风险操作二次确认 UI + 服务端权限校验 |
| Mobile | React Native；`packages/api-client` 共用；本地凭证存储抽象；Metro 配置支持 monorepo |

三端均**不实现任何奖励结算规则**，只展示服务端返回结果；学习事件只上报输入与事件 ID。

---

## 10. 关键决策与理由（含被否决方案）

| 决策 | 理由 / 被否决方案 |
| --- | --- |
| Drizzle + better-sqlite3 | 需要精确控制 PRAGMA（WAL/`busy_timeout`/外键）与同步事务；包内自带 N-API 预编译产物，无需本机编译。否选 Prisma：SQLite pragma 控制需变通、带 query engine 与生成物，但对本项目无收益 |
| Refresh Token 用 HMAC-SHA256 | 高熵随机串无需慢哈希；加 pepper 防「仅 DB 泄漏即可伪造」 |
| 恢复码用 Argon2id | 低熵（人类可抄写长度），必须抗离线暴力破解 |
| 全局唯一 TypeScript 6.0.3 | NestJS CLI 用 `~6.0.2`、RN 模板用 `^6.0.3`；TypeScript 7 尚未被工具链采纳 |
| React 统一 19.2.3 | RN 0.87.1 模板精确版本；monorepo 中避免出现两份 React 导致 hooks 失效 |
| Phase 1 不实现文件上传与 `StorageProvider` | 无真实调用方时为「无意义抽象」；Phase 2 需要宠物/头像资源时实现，安全要求（大小/MIME/真实文件头/目录穿越）已在安全红线中固定 |
| Phase 1 不实现学习/奖励逻辑 | 属 Phase 2、3；Phase 1 只建立「服务端权威 + 幂等 + 事务」的机制骨架 |
| 不引入 Redis | 基线要求；限流与复用检测用 SQLite + 内存计数实现，单机部署足够 |

---

## 11. 扩展点（为后续 Phase 预留，不提前实现）

- `StorageProvider`：本地实现 + 未来 S3 兼容实现的统一接口（Phase 2）。
- SM-2 → FSRS：复习记录完整保存时间、用时、评分、调度参数，升级不需清空数据（Phase 2）。
- 词库可扩展：词库为数据而非硬编码，后台可新增考研/雅思/托福/自定义（Phase 2、7）。
- AI Provider：文本/STT/TTS/Realtime 分别配置与测试，接口按能力拆分（Phase 5）。
- 离线同步：事件信封含 `eventId`、客户端时间、版本号；服务端幂等落地并返回权威结算结果（Phase 7）。

---

## 12. 安全基线

所有实现必须遵守 `SECURITY-GUARDRAILS.md`。与本架构直接相关的几条：

1. 秘密只来自环境变量或仓库外密钥文件；`.env` 不入库；缺失必需密钥时服务端拒绝启动。
2. 客户端数据默认不可信；奖励与结算只由服务端决定。
3. 所有奖励/状态更新在事务内且具备幂等唯一约束。
4. 日志与错误响应脱敏。
5. 未获用户批准，不安装任何额外系统软件、SDK、CLI 或运行环境。
6. 未获授权，不执行 `git reset --hard`、force push、重写历史、大规模删除。
