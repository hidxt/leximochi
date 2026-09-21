# Leximochi 交接文档（HANDOFF）

> **本文件是「当前状态快照」，不是开发流水账。** 新 Agent 读完 `开发提示词.md`、`SECURITY-GUARDRAILS.md` 和本文件后，应能安全继续开发。
> 历史细节交给 Git；已解决的问题从「已知问题」中移除，不要无限累积。
> **禁止在本文件中写入任何密码、Token、API Key、恢复码、主密钥或其他秘密信息。**
> 若本文件与真实代码、Git 状态或实际测试结果不一致，以真实代码/Git/测试为事实来源，并修正本文件。

- 快照时间：2026-09-21
- 当前阶段：**Phase 0 — 项目地基之前（仅完成环境检查与项目级文档建立）**
- 业务代码状态：**尚未开始编写**，仓库中除 `LICENSE`、`开发提示词.md`、本文件与 `SECURITY-GUARDRAILS.md` 外无任何源码

---

## 1. 开工必读（所有 Agent / 子 Agent）

1. `开发提示词.md` —— 需求、产品设计、技术架构、开发规则、安全约束的**主要基线**（不得自行修改，见第 12 节）。
2. `SECURITY-GUARDRAILS.md` —— 全项目安全红线，优先级仅次于 `开发提示词.md`。
3. `HANDOFF.md`（本文件）—— 当前真实状态。
4. 涉及具体任务时，再读相关架构/API/数据库文档（目前尚未创建）。

---

## 2. Git 状态

| 项 | 实际值 |
| --- | --- |
| 仓库根目录 | `C:\Users\auzasr\Documents\Projects\leximochi`（即当前工作目录，唯一项目目录） |
| 当前分支 | `main` |
| 上游 | `origin/main`（`origin` = `git@github.com:hidxt/leximochi.git`，SSH） |
| 本地 commit | `8649e27 Initial commit`（仓库此前只有 `LICENSE`） |
| 工作区（本次快照时） | `LICENSE` 已跟踪；`开发提示词.md` 未跟踪；两份新文档创建后由本次文档提交纳入 |
| Git 用户 | `hidxt` / `moeoxd@gmail.com` |
| 项目许可证 | Apache-2.0（`LICENSE`，201 行，Apache License 2.0） |
| 远端可达性 | SSH 直连可用（`ssh -T git@github.com` 返回已认证为 `hidxt`）；HTTPS 直连 GitHub 超时（见第 9 节） |

> 本次文档工作以独立 commit 提交；**未执行 `git push`**，远端同步由用户决定。

---

## 3. 当前目录与模块结构

```
leximochi/
├── LICENSE                     # Apache-2.0
├── 开发提示词.md                # 需求与开发约束基线（只读，除非用户批准修改）
├── SECURITY-GUARDRAILS.md      # 安全红线（长期生效）
├── HANDOFF.md                  # 本文件（当前状态快照）
└── .git/
```

**尚未创建**（Phase 1 目标结构，见第 8 节）：`apps/{web,mobile,admin,server}`、`packages/*`、`data/*`、根 `package.json`、`.gitignore`、`.env.example`、`README.md`。

---

## 4. 技术栈与实际版本（本机实测）

| 组件 | 实测结果 | 备注 |
| --- | --- | --- |
| OS | Windows 10.0.26200（x64），shell 为 Git Bash 2.55 | — |
| Node.js | **v24.19.0** | 满足主流工具链要求 |
| npm | **11.17.0** | 包管理器统一使用 npm（含 workspaces） |
| Git | 2.55.0.windows.5 | — |
| JDK | **OpenJDK 17.0.20.1 LTS**（Microsoft build） | `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot\` |
| javac | 17.0.20.1 | — |
| Android Studio | **2026.1.4**（`AI-261.26222.65.2614.16379836`） | IDE 自身 `minRequiredJavaVersion: 21`（IDE 自带 JBR，不影响 Gradle 使用 JDK 17；但最新 AGP/RN 可能要求 JDK 21，见第 11 节风险） |
| Android SDK | `ANDROID_HOME=C:\Users\auzasr\AppData\Local\Android\Sdk`（`ANDROID_SDK_ROOT` 为空） | 建议后续在文档中统一使用 `ANDROID_HOME` |
| SDK platforms | **仅 `android-37.0`** | 缺少 RN/Gradle 常用的 compileSdk 平台（如 35/36），首次构建可能触发 SDK 平台下载（需用户批准，见第 11 节） |
| build-tools | `36.0.0`、`37.0.0` | — |
| NDK | `27.1.12297006` | RN 默认构建通常不强制使用 NDK（无自定义原生模块时） |
| CMake | 已随 SDK 安装（`$ANDROID_HOME/cmake`） | — |
| cmdline-tools | `latest`（含 `sdkmanager.bat`、`avdmanager.bat`） | 可用于查询/安装 SDK 组件（安装行为需用户批准） |
| platform-tools / adb | adb 1.0.41（37.0.1），路径 `...\Sdk\platform-tools\adb.exe` | `adb devices` 输出为空 |
| 模拟器 | `emulator.exe` 存在，但 **`-list-avds` 为空**（无已创建 AVD，无系统镜像） | Android 真机/模拟器运行验证目前不可用 |
| Gradle | **无全局 Gradle**；`~/.gradle` 目录不存在（无 wrapper 缓存、无依赖缓存） | 首次 Android 构建需下载 Gradle 发行包与全部依赖（网络已验证可达，见第 9 节） |
| Python | 3.14.7（系统已存在，非本项目安装） | V1 不依赖 Python |
| yarn / pnpm | 均未安装 | 按基线要求使用 npm，不安装额外包管理器 |

其他实测环境事实：磁盘 `C:` 剩余约 **121 GB**。

---

## 5. 数据库与 Migration 状态

- 状态：**未创建**。无 SQLite 数据库文件、无 ORM、无 migration。
- 基线要求（待 Phase 1 落地）：SQLite（不使用 Redis），启用 WAL + 合理 `busy_timeout` + 外键 + 事务 + migration + 备份；业务层与数据访问层解耦；时间统一 UTC 存储。
- ORM 选型（Prisma vs Drizzle）：**尚未决定**。需在 Phase 1 依据 SQLite 支持度、migration 稳定性、与 NestJS 集成成本做对比并记录理由（属于待用户确认的决策点，见第 10 节）。

---

## 6. 主要数据模型 / API

- 数据模型：**尚未设计**（初始 ER 设计将在 Phase 1 前的架构方案中产出）。
- API：**尚不存在**。已知基线约束：明确 DTO + 运行时校验；后台 API 与用户 API 权限严格分离。

---

## 7. 各端当前可运行状态

| 端 | 状态 |
| --- | --- |
| `apps/server`（NestJS） | 不存在，无法运行 |
| `apps/web`（React + Vite） | 不存在，无法运行 |
| `apps/admin`（React） | 不存在，无法运行 |
| `apps/mobile`（React Native Android） | 不存在，无法运行 |
| `packages/*` | 不存在 |

**结论：当前项目没有任何可运行代码，也没有执行过任何构建、测试、lint 命令。**

---

## 8. 已完成 / 进行中 / 未完成

### 已完成
- 完整阅读 `开发提示词.md`（133 行）。
- 只读环境与仓库检查（命令与结果见第 9 节）。
- 建立 `SECURITY-GUARDRAILS.md`（含开发前/提交前/发布前三类检查清单）。
- 建立 `HANDOFF.md`（本文件）。
- 规划 Phase 1 目标目录结构（尚未落地）：

```
leximochi/
├── apps/
│   ├── web/        # React + Vite（用户 Web）
│   ├── admin/      # React + Vite（独立管理后台）
│   ├── mobile/     # React Native（Android，预留 Windows）
│   └── server/     # NestJS + SQLite
├── packages/
│   ├── core/       # 共享业务算法（SM-2、积分/奖励规则等）
│   ├── types/      # 共享类型与 DTO 契约
│   ├── api-client/ # 生成的 API SDK
│   ├── auth/       # 认证相关共享逻辑（抽象，不含秘密）
│   ├── ai/         # AI Provider 抽象与配置模型
│   ├── sync/       # 离线同步事件模型与协议
│   └── shared/     # 设计 Token、工具函数
├── data/           # 运行期数据：db / uploads / audio / pets / backups / logs（不入 Git）
├── docs/           # 架构、数据库设计、API、部署、备份恢复、素材许可证
├── .env.example
├── .gitignore
├── package.json    # npm workspaces 根
└── README.md
```

### 进行中
- 无（等待用户批准 Phase 1 计划）。

### 未完成
- Phase 1 全部内容：Monorepo 初始化、npm workspaces、`.gitignore`/`.env.example`/`README`、NestJS 服务端骨架、SQLite + WAL + migration、ORM 选型、账号注册/登录、`CaptchaProvider` 抽象、恢复码、Access/Refresh Token 与会话管理、RBAC 与管理员权限分离、React Web 骨架、React Native Android 骨架、React Admin 骨架、API SDK、基础测试、开发文档。
- Phase 2–7（词库与复习、宠物闭环、听力、AI 实时口语、长期成长、离线与发布准备）全部未开始。

---

## 9. 实际执行的命令与真实结果（本次快照）

### 环境检查
| 命令 | 真实结果 |
| --- | --- |
| `node -v` | `v24.19.0` |
| `npm -v` | `11.17.0` |
| `git --version` | `git version 2.55.0.windows.5` |
| `java -version` | `openjdk version "17.0.20.1" 2026-08-18 LTS`（Microsoft build） |
| `javac -version` | `javac 17.0.20.1` |
| `adb version` | `Android Debug Bridge version 1.0.41` / `Version 37.0.1-15733141` |
| `adb devices` | 输出为空（无设备连接） |
| `emulator -list-avds` | 输出为空（无 AVD） |
| `gradle -v` | `gradle: command not found`（无全局 Gradle，属预期，RN 使用 wrapper） |
| `ls $ANDROID_HOME/platforms` | 仅 `android-37.0` |
| `ls $ANDROID_HOME/build-tools` | `36.0.0`、`37.0.0` |
| `ls $ANDROID_HOME/licenses` | `android-sdk-license` |
| `git status` / `git log --oneline` | `main` 分支，仅 `8649e27 Initial commit`，`开发提示词.md` 未跟踪 |
| `ssh -T git@github.com` | `Hi hidxt! You've successfully authenticated...`（SSH 直连可用） |

### 网络可达性（HTTPS，2026-09-21 实测）
| 目标 | 代理 `127.0.0.1:10808` | 直连 |
| --- | --- | --- |
| `https://github.com` | **200**（约 2.0s，HTTP 代理） | **超时失败**（curl 返回 `000`，10s） |
| `https://registry.npmjs.org` | — | 200（约 5.5s；npm 实际使用 `registry.npmmirror.com`，0.36s） |
| `https://services.gradle.org` | 200 | **200**（约 5.2s，distributions 请求返回 307 重定向，正常） |
| `https://dl.google.com/dl/android/maven2/...`（真实 artifact） | 200 | **200** |
| `https://repo.maven.apache.org/maven2/` | 200 | **超时失败**（`000`，8s） |
| `https://maven.aliyun.com/repository/{public,google}/...`（真实 artifact） | — | 200 |

**npm 配置实际值**：`registry=https://registry.npmmirror.com/`（来自用户级 `~/.npmrc`），`proxy=null`，`https-proxy=null`。

### 构建 / 测试 / lint / typecheck
- **本次快照未执行任何构建、测试、lint、typecheck 命令**（项目无源码，无 `package.json`）。因此**不存在任何「测试通过」的结论**。

---

## 10. 已确认的关键架构决策及原因

以下决策**已由 `开发提示词.md` 明确**，视为已确认基线：

| 决策 | 原因 |
| --- | --- |
| 统一使用 TypeScript | 基线要求；Web/Admin/Mobile/Server 共享类型与业务逻辑 |
| Monorepo + npm workspaces | 基线要求优先 npm workspaces，不额外引入 pnpm/Bun/Turborepo |
| 后端 NestJS，按领域拆分模块 | 基线要求；领域包括 auth、users、vocabulary、review、study-plan、rewards、pets、achievements、listening、speaking、ai-config、sync、admin 等 |
| 数据库 SQLite（不用 Redis），服务端直接 Node 运行、不依赖 Docker | 基线要求；降低部署复杂度 |
| 服务端为唯一权威结算方（金币/EXP/积分/连续学习/勋章） | 基线要求；客户端数据不可信 |
| 四套独立系统：学习积分 / 金币 / 宠物 EXP / 勋章 | 基线要求，避免公式串用 |
| 仅共享业务逻辑、类型、API SDK、算法与设计 Token；**不强制** Web 与 RN 共用 UI | 基线要求，尊重各平台交互习惯 |
| 不做 V1 范围外功能（好友、排行榜、私聊、社区、金币充值、多宠物、Live2D、阅读/写译模考、iOS、Windows） | 基线要求，可预留扩展点但不提前实现 |
| 认证使用「用户名 + 密码」+ 人机验证抽象 + 一次性恢复码 | 基线要求 |
| AI 能力由用户自带 API Key，服务端 AEAD 加密存储，文本/STT/TTS/Realtime 分别配置 | 基线要求；平台不承担用户模型费用 |
| 时间统一 UTC 存储，客户端本地时区展示 | 基线要求 |

**尚未决策、需要用户确认的点**（Phase 1 前）：

1. **ORM 选型**：Prisma 还是 Drizzle（对比维度：SQLite 支持、migration 稳定性与可读性、类型安全、与 NestJS 集成成本、生成物体积）。最终选择与理由将写入 `docs/` 架构文档。
2. **Maven/Gradle 依赖源策略**：本机直连 `repo.maven.apache.org` 失败（需代理），可选方案：(a) 项目内 Gradle 代理配置指向 `127.0.0.1:10808`；(b) 项目内声明阿里云镜像仓库。属供应链决策，倾向 (a) 以保持官方源，需用户确认。
3. **Android 是否需要补充 SDK 平台与模拟器**：当前仅 `android-37.0`、无 AVD。若选定的 RN 版本要求 compileSdk 35/36，需要下载 SDK 平台；若要跑模拟器，还需下载系统镜像并创建 AVD（两者均需用户批准）。
4. **JDK 版本是否升级到 21**：若选定的 RN/AGP 版本要求 JDK 21，则需申请安装新 JDK（需用户批准）。
5. **依赖版本策略**：RN / NestJS / React 具体主版本（倾向取当时最新稳定且互相兼容的组合，需在 Phase 1 核验并记录）。

---

## 11. 已知 Bug / 技术债 / 风险 / 阻塞项

### Bug
- 无（尚无代码）。

### 风险
| 风险 | 影响 | 当前处置 |
| --- | --- | --- |
| Android SDK 仅 `android-37.0`，缺少常见 compileSdk 平台 | 首次 Android 构建可能失败或需下载 SDK 平台 | Phase 1 建 Android 骨架前先核验 RN/AGP 所需 compileSdk，再向用户申请 |
| 无 AVD、无连接设备 | 无法在模拟器/真机验证 Android 端 | 需用户决定：连接真机 / 批准下载系统镜像创建 AVD / 仅做构建验证 |
| `~/.gradle` 不存在 | 首次 Android 构建需下载 Gradle 发行包与全部依赖，耗时较长 | 网络已验证可达；预计首次构建耗时显著 |
| 直连 `repo.maven.apache.org` 超时 | Gradle 拉取 Maven Central 依赖失败 | 见第 10 节决策点 2 |
| 直连 `github.com`（HTTPS）超时，SSH 可用 | HTTPS 方式的 GitHub 操作受阻 | 按基线规则：优先代理 `127.0.0.1:10808`，失败则直连；本仓库 remote 为 SSH 且可用 |
| Android Studio 要求 JDK 21，本机 JAVA_HOME 为 17 | 若 RN/AGP 新版要求 JDK 21，Gradle 构建可能失败 | Phase 1 核验后决定是否申请安装 JDK 21 |
| Node 24 与部分工具链的兼容性 | 个别依赖可能不支持 Node 24 | Phase 1 安装依赖时实测；如冲突再评估是否需要 Node 版本管理工具（需用户批准） |
| 文档可能随实现漂移 | 交接失真 | 每个 Phase/Task/ migration/依赖变更后更新本文件 |

### 阻塞项
- 无硬阻塞。**当前等待用户批准 Phase 1 计划后再进入正式开发**（按基线「现在的执行顺序」要求）。

### 技术债
- 尚无代码，因此无技术债。已提前记录的架构约束：业务逻辑不得复制到 Web/Mobile/Admin；核心规则放在可测试的共享模块或服务端。

---

## 12. `开发提示词.md` 修改请求流程

`开发提示词.md` 是主要基线但**不是不可修改**，也**不允许 Agent 自行修改**。发现技术错误、过时内容、内部冲突、不合理约束、已无法实现的要求或明显更可靠替代方案时：

1. 不要直接修改；
2. 说明：原规则 / 发现的问题 / 依据（官方文档、依赖兼容性、安全审计或架构设计证据）/ 不修改的影响 / 建议修改内容 / 影响范围；
3. 等待用户明确批准；
4. 获得批准后修改，且若涉及安全要求，同步更新 `SECURITY-GUARDRAILS.md`。

当前状态：**本次未发现需要修改的条目**（若后续发现，将在此处登记：原规则、问题、状态）。

---

## 13. 环境依赖与安装规则（长期生效）

- **允许**：在项目目录内通过 `npm` 安装正常项目依赖（React、React DOM、React Native、NestJS、Vite、测试/构建工具等），无需逐次询问。
- **必须先申请并等待用户明确命令**：pnpm、Bun、Yarn、Python 包、Docker、Visual Studio、CMake、新 JDK、额外 Android SDK 平台/系统镜像/构建工具、模拟器镜像、全局 CLI、winget/Chocolatey/Scoop 等系统包管理器、任何安装器或下载脚本。申请时必须说明：缺少什么、为什么需要、计划安装的软件与具体版本、来源、用途、磁盘/系统影响、是否存在替代方案。
- **禁止**擅自修改系统级或全局配置（Git 全局代理、npm 全局 registry、环境变量、证书）。
- **禁止**为了开发速度绕过 `SECURITY-GUARDRAILS.md` 中的任何红线。

---

## 14. GitHub 网络操作规则（长期生效）

- 本地 `git commit` 不需要网络，正常执行。
- 涉及 GitHub 网络操作（`clone`/`fetch`/`pull`/`push`/GitHub API/下载 GitHub 资源）**优先使用代理 `127.0.0.1:10808`**（推荐以当前命令/当前进程/当前仓库范围配置，如 `git -c http.proxy=http://127.0.0.1:10808 ...`）。
- 代理无法连接、协议不兼容或实测不可用时，**自动切换为直连**，不要因代理不可用阻塞开发。
- 代理与直连**均失败**时，向用户报告实际错误与已尝试方法，**禁止无限重试**。
- 禁止擅自永久修改系统级/全局 Git 代理配置。
- 本仓库 remote 为 SSH（`git@github.com:hidxt/leximochi.git`），SSH 直连已实测可用；HTTPS 直连 GitHub 实测超时。

---

## 15. 危险操作约束（长期生效）

- 未经用户明确授权，禁止：`git reset --hard`、force push、重写历史（对已推送提交 amend/rebase/filter-branch）、删除分支或标签、`git clean -fdx`、大规模删除仓库文件、跳过钩子（`--no-verify`）。
- 破坏性 Git 操作前先 `git status` 并保护未提交改动。
- 禁止提交秘密、数据库文件、`data/`、日志、构建产物。
- 提交使用 Conventional Commits，保持提交小而聚焦。

---

## 16. 下一步任务优先级

1. **等待用户批准** Phase 1 计划与第 10 节 5 个待决策点。
2. 用户批准后，按顺序推进 Phase 1：
   a. 架构方案 + 目录规划 + 初始数据库 ER 设计 + Phase 1 实施计划与验收标准（文档化到 `docs/`）。
   b. Monorepo 地基：根 `package.json`（npm workspaces）、`.gitignore`、`.env.example`、`README.md`、TS 基础配置、lint/format/测试脚手架。
   c. `apps/server`：NestJS 骨架 + SQLite(WAL/busy_timeout/外键) + ORM 选型落地 + migration 机制 + 配置与秘密加载校验。
   d. 账号系统：注册/登录、`CaptchaProvider` 抽象、Argon2id 密码哈希、恢复码（哈希入库、一次性）、Access/Refresh Token（轮换+撤销+设备会话）、限流与风控、审计。
   e. RBAC 与 `apps/admin`：权限模型、守卫、管理员与用户域隔离、管理员审计与高风险操作二次确认。
   f. `apps/web`、`apps/mobile` 骨架 + `packages/*`（types、api-client、core、shared）。
   g. 基础测试：注册登录、恢复码、Token 生命周期、管理员权限、加解密、上传安全等（单元 + 集成 + 关键 E2E）。
   h. Phase 1 验收输出：已完成/未完成、真实测试结果、安全检查结论、技术决策、Git 提交、下一阶段计划，并更新本文件。
3. README 与 `docs/`（架构、数据库设计、API、开发环境、Android 构建、AI Provider 配置、素材许可证、部署、备份恢复、安全说明）随实现同步维护。

---

## 17. 本文件维护规则

- 每完成重要 Task、Phase、数据库 migration、重大架构调整、重要依赖变更或发现重大风险后，立即更新本文件。
- 每个 Phase 结束前、以及准备结束当前会话前，必须检查并更新本文件。
- 保持「当前状态快照」形态：已解决的问题从当前 Bug/风险/阻塞项中移除，历史交由 Git，禁止无限膨胀。
- 所有条目必须与真实代码、Git 状态、实际测试结果一致；**禁止在没有实际证据时写「已完成」或「测试通过」**。
- 禁止写入任何秘密信息。
