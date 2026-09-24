# Leximochi Phase 2（单词核心）验收报告

- 验收日期：2026-09-24
- 验收范围：`开发提示词.md` 中 Phase 2「单词核心」全部内容；计划见 `docs/plans/2026-09-22-phase-2-vocabulary.md`（含实施偏差 D1–D5）
- 结论：**14 项验收标准全部通过**，未发现阻断性问题；已完成本地提交并 push 到 `origin/main`

---

## 1. 全量检查结果（真实命令与输出摘要）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | exit 0（全部 workspace） |
| `npm run lint` | exit 0（全部 workspace） |
| `npm test` | exit 0：服务端 **217**、core 33、types 10、api-client 7、auth 7、web 13、admin 14、mobile 9（合计 **310 个用例**） |
| `npm run build` | exit 0（含 `nest build` 产出 `dist/main.js`、Vite 构建 web/admin） |
| `npm run build:android -w @leximochi/mobile` | `BUILD SUCCESSFUL in 6m 42s`，产出 `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`（约 124 MB，4 ABI） |
| `npm audit --omit=dev --registry=https://registry.npmjs.org/` | **0 vulnerabilities**（生产依赖） |
| `npm audit`（含 dev） | 4 moderate，全部来自 `drizzle-kit → @esbuild-kit/core-utils → esbuild ≤0.24.2`（dev 工具链、非生产路径）；修复需 `--force` 破坏性升级，故保留并记录 |

---

## 2. 验收标准逐项对照

| # | 验收项 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | typecheck / lint / build 全仓库通过 | ✅ | 上表 exit 0 |
| 2 | `npm test` 全仓库通过，用例数 ≥ 180 | ✅ | 310 个用例（Phase 1 为 121） |
| 3 | SM-2 四种评分的间隔/难度变化、下限 1.3、掌握判定有单测 | ✅ | `packages/core/src/sm2.spec.ts`（core 33 用例，含 again/hard/good/easy 分支、ease 下限与上限、mastered 判定、错拼惩罚累加） |
| 4 | 复习提交幂等（含并发）只更新一次状态 | ✅ | `test/review-submit.e2e-spec.ts`（同 eventId 顺序重试）；`test/acceptance-phase2.spec.ts › 并发提交同一 eventId 只落一条流水、只推进一次状态`（`Promise.all` 三路并发 → 流水 1 条、`total_reviews = 1`） |
| 5 | 选择题响应不含正确答案，判定由服务端返回 | ✅ | `test/study-next.e2e-spec.ts`（题干与选项均不含答案词形）；`SubmitReviewResponse.correctAnswer` 由服务端判定返回 |
| 6 | 词库可扩展：新增第三个词库无需改业务分支 | ✅ | `test/acceptance-phase2.spec.ts › 新增词库无需改业务代码即可被列出并用于出题`（插入 `gre` 词库后 `GET /wordbooks`、`/wordbooks/gre/version`、`POST /study/next` 全部直接生效） |
| 7 | 词典数据与 AI 内容分离 | ✅ | `test/word-import.spec.ts`（AI 内容写入 `word_ai_notes`）；`test/acceptance-phase2.spec.ts › AI 补充内容独立存储，不覆盖词典字段`（写入 AI 备注后 `senses` 原样、`aiNotes` 单独返回） |
| 8 | 上传安全：伪造扩展名 / 超大文件 / 路径穿越 | ✅ | `test/file-validation.spec.ts`（20 用例：魔数识别、扩展名与内容一致性、5MB 上限、文件名与存储 key 安全）；`test/admin-vocabulary.e2e-spec.ts`（真实 MP3 通过、文本冒充 `.mp3` → 415、超限 → 413/415、词条不存在 → 404 且不落盘） |
| 9 | 生词本越权返回 404 | ✅ | `test/notebook.e2e-spec.ts`（他人条目不可见、`DELETE` 他人条目 404 且原数据不变） |
| 10 | 后台词库能力：非权限 403、导入逐条结果并写审计、高风险删除二次确认 | ✅ | `test/admin-vocabulary.e2e-spec.ts`（6 类接口 403、导入 `failed[]` 明细、`confirm` 缺失 400）；Admin 界面浏览器实测（导入结果显示「新增 0 / 更新 1 / 失败 2」与逐条原因，审计日志出现 `admin.wordbook.created`、`admin.wordbook.deleted`、`admin.words.imported`） |
| 11 | Web：学习/复习/拼写/听写/生词本/统计在浏览器真实跑通 | ✅ | Chrome 实测（真实数据）：词库列表（六级 3991 词 v2 / 四级 4544 词 v2）→ 新词选择题答对落「对」印章并返回服务端 SM-2 状态（次日到期）→ 拼写答错记录「错字母」→ 听写无音频时明确提示不可用 → 生词本搜索加入/移出 → 统计页今日量 1/正确率 50%/平均用时与 7 日趋势、错拼清单「cancel 错 1 次 · 最近输入 cansel」→ 我的（设备会话）；控制台无报错 |
| 12 | Android `assembleDebug` 成功；词库下载与离线读取有单测 | ✅ | 构建见上表；`__tests__/wordbook-offline.test.ts` 7 用例（分页下载、版本一致跳过、版本变化重下、离线搜索前缀优先、按 id 取词、删除清理、本地损坏自愈） |
| 13 | 审计与日志不含秘密；错误响应不泄露内部路径 | ✅ | `test/admin-vocabulary.e2e-spec.ts › 审计日志不记录任何秘密`（抽查 `admin.word%` 元数据不含 audioKey/token/secret/password）；`test/acceptance-phase2.spec.ts › 错误响应不泄露堆栈、文件路径或数据库细节`（404/400 响应不含 sqlite、node_modules、`dist/`、绝对路径、堆栈） |
| 14 | 文档与实际实现一致 | ✅ | `docs/api.md`（§4 后台、§7–9 词库/学习/生词本全部接口与错误码）、`docs/database-design.md`（§9 Phase 2 表结构）、`docs/android-build.md`（代理与签名命令复测更新）、`HANDOFF.md`、本文件 |

---

## 3. 安全自检（对照 `SECURITY-GUARDRAILS.md`）

| 检查项 | 结果 |
| --- | --- |
| 硬编码秘密扫描（`apps/*/src`、`packages/*/src`） | 未发现（无 `sk-`/AKIA/明文口令与密钥） |
| `.env`、`*.keystore`、`*.jks`、`*.sqlite` 是否入库 | 未跟踪（`git ls-files` 无匹配） |
| 生产依赖漏洞 | 0（`npm audit --omit=dev`） |
| 客户端伪造评分/调度参数 | 被 DTO 白名单拒绝（`test/review-submit.e2e-spec.ts › 提交内容不可信`） |
| 奖励/学习结算权威性 | 对错、评分、`easeFactor`/`dueAt` 全部由服务端计算，客户端只上报答题事实 |
| SQL 注入 | 全部查询使用绑定参数或 Drizzle 参数化；`LIKE` 通配符已转义（`escapeLike`） |
| 越权（IDOR） | 生词本、会话、词条状态均以 `user_id` 限定；后台逐接口校验权限（403 已测） |
| 上传与路径穿越 | 大小/扩展名/真实 MIME 三重校验 + 服务端生成 key + 写入前断言仍在存储根内 |
| 错误与日志泄密 | 统一错误响应只含 `code`/`message`/`requestId`；已有测试断言不含路径与堆栈 |
| 审计覆盖 | 认证、后台用户操作、后台词库/词条/导入/音频操作全部落审计，元数据不含秘密 |

已知并接受的风险（记录在 `HANDOFF.md`）：dev 工具链 `esbuild ≤0.24.2` 的 4 个 moderate 告警；`ChallengeCaptchaProvider` 的已消费挑战仍为进程内集合（Phase 7 切表）；`trust proxy` 需在反向代理部署时配置。

---

## 4. 与计划的偏差

见 `docs/plans/2026-09-22-phase-2-vocabulary.md` 第 8 节（D1 错拼清单接口、D2 错拼权重常量、D3 惩罚叠加顺序、D4 单条写入服务与 `version` 语义、D5 删除影响范围）。

偏差均为实现细节补充，未改变 Phase 2 的功能边界。

---

## 5. 遗留项（不阻塞 Phase 2 验收，按阶段推进）

1. **音频资源缺失**：当前词库无发音文件，听写在服务端明确降级提示；音频播放接口与 TTS 生成属于 Phase 4/5。
2. **英美发音的边界**：英式/美式音标与音频 key 已入库、随词条返回并展示，后台可上传两种口音的音频；**用户级「默认口音偏好」开关与播放**依赖音频资源与播放链路，安排在 Phase 4/5 一并实现（当前无任何音频文件，先做开关无法验证真实效果）。
3. **Android 未做真机/模拟器运行验证**：本机无 AVD 与真机（用户已确认按「可构建 + 单测」验收）。
4. **未安装任何额外系统软件**：Phase 2 仅新增项目内 npm 依赖（含 `@react-native-async-storage/async-storage`）。
5. **词库数据不入 Git**：使用「下载 + 导入」流程（`npm run fetch:dataset` + `npm run import:wordbook`），来源与授权记录见 `docs/asset-licenses.md`。
