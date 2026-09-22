# Phase 1 验收报告（项目地基）

> 本报告只记录**实际执行**的命令与真实结果。任何未执行、未验证的项都显式标注为「未验证」。
> 基线：`开发提示词.md`、`SECURITY-GUARDRAILS.md`、`docs/plans/2026-09-21-phase-1-foundation.md`

- 验收时间：2026-09-22
- 结论：**服务端 / Web / Admin 全部验收通过；Android 端见第 5 节**
- 执行者：开发 Agent（本轮会话）

---

## 1. 已完成内容

| 计划任务 | 产出 | 状态 |
| --- | --- | --- |
| 1 Monorepo 地基 | npm workspaces、TS 6.0.3 基座、ESLint/Prettier、`.gitignore`/`.gitattributes`/`.env.example`、workspaces 校验脚本、README | ✅ |
| 2 `@leximochi/types` | 错误码、权限键、限额常量、认证/后台 DTO 契约 | ✅ |
| 3 `@leximochi/core` + `@leximochi/shared` | 用户名/密码/恢复码纯规则、设计 Token | ✅ |
| 4 服务端骨架 | 启动期配置校验、统一错误模型、ValidationPipe 白名单、helmet、CORS 白名单、CSRF Origin 校验、请求 ID、`/health` | ✅ |
| 5 数据库层 | 10 张表 schema、首版迁移、WAL/`busy_timeout`/外键启动断言、仓储接口 + Drizzle 实现、种子角色与权限 | ✅ |
| 6 验证码与注册 | `CaptchaProvider` 抽象 + 挑战验证码（HMAC/TTL/一次性/绑定 IP）、Argon2id、10 个恢复码哈希入库、失败补偿 | ✅ |
| 7 登录与 Token | JWT access token、refresh 轮换 + 复用检测、登出/退出全部设备/设备会话管理、全局认证守卫 | ✅ |
| 8 恢复码 | `/auth/recovery` 一次性重置（先校验强度再消费、撤销全部会话、整组重发） | ✅ |
| 9 限流与锁定 | 登录双维度计数、注册/恢复码/验证码限流、锁定审计、成功登录清除失败计数 | ✅ |
| 10 RBAC 与后台 | `PermissionsGuard` + `/admin/*`（检索/封禁/解封/审计）+ `create-admin` 脚本 | ✅ |
| 11 API SDK | `@leximochi/api-client`（ApiError 解包/鉴权头/401 回调）+ `@leximochi/auth`（会话状态机，restore 记忆化） | ✅ |
| 12 Web 端 | 注册（含恢复码保存确认）、登录（含恢复码重置）、受保护首页（账号信息 + 设备会话管理） | ✅ |
| 13 Admin 后台 | 管理员登录、用户检索/过滤/分页、封禁（二次确认+必填原因）/解封、审计日志 | ✅ |
| 14 Android 端 | RN 0.87.1 初始化、workspace 改造、Metro monorepo 配置、Gradle 项目内代理、登录/首页界面 | 见第 5 节 |
| 15 验收与文档 | 本报告、`docs/api.md`、`HANDOFF.md` 更新 | ✅ |

---

## 2. 实际执行的命令与真实结果

### 2.1 全仓库

| 命令 | 结果 |
| --- | --- |
| `npm install` | exit 0（含全部 workspace） |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0 —— 服务端 77、admin 6、web 4、api-client 7、auth 7、core 15、types 3、mobile 2，合计 **121 个用例** |
| `npm run build` | exit 0 |

### 2.2 服务端

| 命令/操作 | 结果 |
| --- | --- |
| `npm run build -w @leximochi/server` | exit 0，产出 `dist/main.js`（CJS，依赖 Node 24 `require(esm)` 加载 Nest 12 的 ESM 包） |
| `npm test -w @leximochi/server` | exit 0 —— 13 个 suite / 77 个用例，覆盖：配置校验 6、健康检查 2、数据库 5、验证码 6、注册 7、登录 12、会话 4、TokenService 5、恢复码 8、限流 5、锁定 4、后台权限 5、后台管理 8 |
| 启动实测（本地随机密钥 `.env`） | `/health` → 200；未知路由 → 404 统一错误格式且无堆栈；CSP/nosniff/X-Frame-Options/x-request-id 均存在；自动创建 `data/db/leximochi.sqlite` 与 `-wal`/`-shm` |
| 启动实测（占位秘密） | **拒绝启动**，退出码 1，日志仅打印变量名与原因，不含秘密值 |
| 只读连接校验 | `journal_mode` = `wal`；10 张业务表 + `__drizzle_migrations` 均在 |
| `create-admin` 脚本 | 首次创建成功（仅输出用户名）；重复执行（未加 `--allow-existing`）退出码 1；缺 `ADMIN_PASSWORD` 打印用法并退出码 1；库内确认 admin 角色与 `admin.bootstrap.created` 审计 |

### 2.3 各包与前端的自动化测试

| 包 | 用例数 | 关键覆盖 |
| --- | --- | --- |
| `@leximochi/types` | 3 | 错误码与取值校验 |
| `@leximochi/core` | 15 | 用户名归一化/校验、密码策略与判定顺序、恢复码生成与易混字符映射 |
| `@leximochi/api-client` | 7 | 成功解包、ApiError 映射、非 JSON 错误兜底、鉴权头、401 回调、查询参数编码、移动端传输标记 |
| `@leximochi/auth` | 7 | 登录/登出状态流转、restore 成功与失败、重复与并发 restore 只触发一次 refresh、登出后 restore 重新刷新 |
| `@leximochi/web` | 4 | 受保护路由重定向、注册页恢复码展示与保存确认门禁、错误提示 |
| `@leximochi/admin` | 6 | 二次确认必填原因、确认后才调用封禁、权限不足错误提示、解封路径 |
| `@leximochi/mobile` | 2 | 本地会话存储读写与清理 |

### 2.4 浏览器端实测（真实交互，非仅单测）

用 Chrome 通过 DevTools 协议实际操作：

**Web（http://localhost:5173）**
1. 打开注册页 → 页面从 API 取得真实人机验证题（如 `45 + 66 = ?`）；
2. 填写并提交 → 展示 10 个恢复码；「我已保存，去登录」在勾选确认前为禁用（门禁生效）；
3. 登录 → 跳转受保护首页，显示真实账号（用户名、注册时间、身份、状态）与设备会话（UA、IP、最近活动）；
4. **刷新页面** → 通过 HttpOnly Cookie 自动恢复会话，未被重定向到登录页；
5. 点击退出登录 → 回到登录页；
6. 控制台**无任何错误或警告**。

**Admin（http://localhost:5174）**
1. 管理员账号登录成功 → 进入 `/users`；
2. 用户列表显示真实数据（用户名、ID、状态、角色、注册/最后登录时间）；
3. 点击「封禁」→ 弹出二次确认，未填写原因时「确认封禁」禁用；填写原因并确认后 → 该用户状态变为「已封禁」，操作列变为「解封」；
4. 审计日志页可见真实事件流：`auth.register.succeeded`、`auth.login.succeeded`、`admin.user.banned`、`admin.bootstrap.created`、以及修复前的 `auth.token.reuse_detected`；
5. 用**非管理员账号**登录后台 → 提示「该账号没有后台权限」并停留在登录页（服务端亦强制 403，由 e2e 用例覆盖）。

---

## 3. 安全检查结果（对照 `SECURITY-GUARDRAILS.md` 第 15.2 / 15.3 节）

| 检查项 | 结果与证据 |
| --- | --- |
| 仓库无秘密（`.env`/密钥/数据库文件/`data/`） | ✅ `git status` 无未跟踪敏感文件；`.env` 被 `.gitignore` 命中；文档与代码中无硬编码秘密（多处 grep 无命中） |
| 秘密只来自环境变量 | ✅ 启动期校验：缺失/过短/占位值一律拒绝启动（实测） |
| 错误响应不泄露内部信息 | ✅ 实测 404 与 401 响应仅含 `code/message/requestId`，无堆栈、SQL、路径 |
| 密码与恢复码哈希 | ✅ Argon2id（`@node-rs/argon2`，m=19456, t=2, p=1）；库中只有哈希（测试断言明文不在库中） |
| Refresh Token 存储 | ✅ 仅存 `HMAC-SHA256(token, 服务端密钥)`；高熵随机串（256 bit）；轮换 + 复用检测 |
| 认证绕过 | ✅ 未带 token 访问受保护接口 401；被撤销/过期会话 401 |
| 权限绕过 / IDOR | ✅ 普通用户访问 `/admin/*` 全部 403；删除他人会话返回 404；降权后**立即**失效（权限每请求读库） |
| 越权与枚举 | ✅ 登录失败与账号不存在返回同一错误码；恢复码无效与用户不存在返回同一错误码；登录失败做时序对齐 |
| SQL 注入 | ✅ 全部使用 Drizzle 参数化查询；后台检索的 `LIKE` 通配符已转义（有用例） |
| XSS/CSRF | ✅ 前端不使用 `dangerouslySetInnerHTML`；Cookie 承载的非幂等请求强制 `Origin` 白名单 + `SameSite=Lax` |
| 文件上传 / 目录穿越 | 不适用（Phase 1 无上传功能，`StorageProvider` 推迟到 Phase 2） |
| 限流与暴力破解 | ✅ 登录按用户名/IP 双维度、注册/恢复码/验证码分别限流；锁定写审计 |
| 幂等与事务 | ✅ 恢复码消费为条件更新（`changes=1` 才算成功）；用户名唯一性依赖 UNIQUE 约束；写操作走事务 |
| 数据完整性 | ✅ WAL/`busy_timeout=5000`/外键在启动时断言生效；迁移可重复执行且幂等 |
| 审计 | ✅ 认证与后台关键动作均写审计，且不含密码/恢复码/Token（有用例断言） |
| 客户端不可信 | ✅ 服务端为唯一权威方；Phase 1 尚无奖励结算，机制骨架（服务端判定 + 幂等）已建立 |
| 依赖与供应链 | 见 3.1 |
| 无恶意代码/遥测/广告 SDK/挖矿 | ✅ 代码与依赖中无此类内容；无任何未说明的外部网络调用 |

### 3.1 依赖审计

- `npm audit --omit=dev` 结果见 `HANDOFF.md` 记录；如存在告警会在该处给出处置结论。
- npm 11 默认**拦截依赖的 install/postinstall 脚本**（实测拦截 `better-sqlite3` 的 `node-gyp rebuild`、`esbuild`、`unrs-resolver`）。当前依赖链不需要这些脚本：better-sqlite3 自带 N-API 预编译产物，Vite/Vitest/Jest 均实测可用。**未使用** `npm approve-scripts` 放行任何脚本。
- 本次未安装任何额外的系统软件、SDK、CLI 或运行环境；Android 构建所需的 compileSdk 37 / buildTools 37.0.0 / NDK 27.1.12297006 本机已存在，未下载任何 SDK 组件。

---

## 4. 重要技术决策（本轮新增，详见计划文件的实施偏差表）

1. **服务端产出 CJS、依赖 Node 24 `require(esm)`**：NestJS 12 全系为 ESM-only 包；Jest 需 `--experimental-vm-modules`（与 Nest 12 官方模板一致）。
2. **`.env` 用 Node 原生 `--env-file-if-exists`**：不引入 dotenv/@nestjs/config。
3. **恢复码哈希归一化形式**：注册与校验统一哈希「去连字符、统一大小写」后的值（否则用户按生成格式输入也无法通过）。
4. **客户端 refresh 记忆化**：refresh 会轮换并撤销上一会话，因此 `restore()` 必须记忆化；否则 React 严格模式的重复效应会触发服务端复用检测并撤销整个会话族（真实浏览器发现）。
5. **Vite 不使用代理，直连 API 源**：refresh Cookie 的 path 为 `/auth`，经代理会被浏览器视为 `/api/auth` 而不发送。
6. **移动端 `10.0.2.2:3100`**：Android 模拟器访问宿主机的约定地址。
7. **管理后台与用户端独立应用、同源 Token**：两端各自构建与部署，共用 `packages/*`。

---

## 5. Android 端验收

**构建结果：通过** ✅

| 项 | 实际值 |
| --- | --- |
| 命令 | `cd apps/mobile/android && ./gradlew assembleDebug --no-daemon` |
| 结果 | `BUILD SUCCESSFUL in 20m 16s`（93 个 task：83 executed / 10 up-to-date） |
| APK | `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` |
| 体积 | 122,716,783 字节（约 117 MB；debug 包含 4 个 ABI 的原生库：armeabi-v7a / arm64-v8a / x86 / x86_64） |
| 使用的工具链 | Gradle 9.4.1（wrapper）、AGP 9.2.1、Kotlin 2.2.0、JDK 17.0.20.1、compileSdk 37 / buildTools 37.0.0 / NDK 27.1.12297006（均为本机已装组件，未额外下载 SDK） |
| 依赖 | 首次构建下载 Gradle 发行包与 Maven 依赖（经项目内代理配置；`dl.google.com`/`services.gradle.org` 直连） |
| autolinking | 正常识别 `react-native-safe-area-context`（CLI 输出 `reactNativePath` 指向仓库根 `node_modules/react-native`） |
| 测试 | `npm test -w @leximochi/mobile` → 2 个用例通过；`npm run typecheck` → exit 0 |

**为跑通构建所做的两项 monorepo 适配**（npm workspaces 会把 `react-native` 提升到仓库根）：

1. `apps/mobile/android/settings.gradle`：`@react-native/gradle-plugin` 改为在「本地 `node_modules`」与「仓库根 `node_modules`」两处查找（Gradle 要求该逻辑写在 `pluginManagement` 内，且 `includeBuild` 传相对路径字符串）。
2. `apps/mobile/android/app/build.gradle` 的 `react` 块：显式设置 `root` / `reactNativeDir` / `codegenDir` / `cliFile` 指向仓库根，否则 RNGP 默认路径 `../../node_modules/react-native` 不存在，构建在配置阶段即失败。

**运行验证：未进行**。本机 `adb devices` 为空、无 AVD，用户已确认 Phase 1 仅要求「可构建」验证；设备运行验证推迟到有真机或后续阶段。

---

## 6. 未完成内容（显式推迟，非缺陷）

| 项 | 推迟原因 |
| --- | --- |
| `StorageProvider` 与文件上传 | Phase 1 无真实调用方；Phase 2 随宠物/头像资源实现，安全要求已在红线中固定 |
| 词库、单词学习、SM-2 复习 | Phase 2 |
| 学习积分、金币、连续学习、Reward Ledger、宠物系统 | Phase 3 |
| 听力、AI 口语、勋章与通知、离线同步 | Phase 4–7 |
| 管理后台其余模块（词库/听力/宠物/奖励规则/公告/系统配置等） | 随对应 Phase 实现 |
| Refresh Token 的跨标签页协调 | 已用 `restore()` 记忆化 + 失败重试缓解；彻底方案（BroadcastChannel 或服务端宽限窗口）记入技术债 |
| `auth_attempts` 的历史记录清理（保留期） | 记入技术债，发布前需明确保留策略 |
| 验证码「已消费」记录的多实例共享 | 当前为进程内集合；多实例部署前改用已建好的 `captcha_challenges` 表 |

---

## 7. Git 提交（本轮，`git log --oneline` 原样）

```
434d50c feat(admin): 实现独立管理后台（用户管理与审计日志）
2481677 feat(web): 实现注册/登录/受保护首页与设备会话管理
3c5776b docs(handoff): 更新至 Task 11 完成状态（107 个用例）
2b3dba5 feat(api-client,auth): 实现类型安全 HTTP 客户端与会话管理器
4919082 feat(admin): 实现 RBAC 权限守卫、后台用户管理与审计查询
8d33d5d feat(auth): 实现限流与登录暴力破解防护
055ea23 feat(auth): 实现一次性恢复码重置密码
1fd09e7 docs(handoff): 更新 Phase 1 中期状态快照
ce53d73 feat(auth): 实现登录、Refresh 轮换与设备会话管理
b5ca547 feat(auth): 实现验证码抽象、仓储层与用户注册
f94a7bf feat(server): 落地 SQLite schema、migration 与种子角色
4a96e7d feat(server): 搭建 NestJS 骨架、启动期配置校验与统一错误模型
f575beb feat(core,shared): 实现用户名/密码/恢复码纯规则与设计 Token
16097b3 feat(types): 定义错误码、权限键、限额与认证 DTO 契约
0904604 chore(monorepo): 初始化 npm workspaces 地基与工程规范
6689da0 docs(phase-1): 补充架构方案、初始 ER 设计与 Phase 1 实施计划
7368587 docs(handoff): 记录已确认的架构决策与依赖版本清单
714fac7 docs: 建立项目安全红线与交接文档
8649e27 Initial commit
```

**未 push 到远端**（本地领先 `origin/main`）。是否推送由用户决定。

---

## 8. 已知问题与下一步

**已知问题**：见 `HANDOFF.md` 第 11 节（技术债与风险）。当前无已知功能缺陷，全部自动化用例通过。

**下一步优先级**：
1. Phase 1 收尾：确认 Android 构建产物与 monorepo 配置已入库；如有真机则补做运行验证。
2. 进入 **Phase 2（单词核心）**：可扩展词库与 CET-4/CET-6 数据、新词卡片学习、SM-2 调度、多题型复习、英美发音、拼写与听写、生词本、学习历史与统计；同时实现 `StorageProvider` 与文件上传安全。
