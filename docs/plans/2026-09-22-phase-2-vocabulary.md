# Leximochi Phase 2（单词核心）实施计划

> **For agentic workers:** 使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐任务执行。步骤用 `- [ ]` 跟踪。

**Goal:** 实现可扩展词库与完整的单词学习闭环：CET-4/CET-6 数据、新词卡片学习、SM-2 间隔重复、多题型复习、拼写与听写训练、生词本、学习历史与基础统计，以及支撑上述功能的最小管理能力（词库/词条 CRUD、批量导入、音频上传）。

**Architecture:** 词库为**纯数据**（词库与词条分离，多对多关联），业务逻辑不硬编码任何具体词库；复习调度由服务端唯一权威计算，客户端只上报答题事件（含 `eventId` 幂等键）与原始输入，服务端判定对错、更新 SM-2 状态并落 `review_logs`（完整保留调度参数，为未来升级 FSRS 预留，不要求用户清空数据）。

**Tech Stack:** 沿用 Phase 1（TypeScript 6.0.3 / NestJS 12 / Drizzle + better-sqlite3 / React 19.2.3 + Vite 8 / RN 0.87.1），新增文件存储抽象 `StorageProvider`（本地实现）。

**Spec:** `开发提示词.md`（词库系统、单词学习与复习、拼写与听写、文件存储、管理员系统、测试要求）、`SECURITY-GUARDRAILS.md`、`HANDOFF.md`、`docs/architecture.md`、`docs/database-design.md`

---

## Global Constraints

沿用 Phase 1 的全部约束（见 `docs/plans/2026-09-21-phase-1-foundation.md` 的 Global Constraints），并补充 Phase 2 专属约束：

- **词库不得硬编码**：`CET-4`/`CET-6` 只能是数据行，禁止出现在业务逻辑的分支条件里（如 `if (book === 'cet4')`）。
- **词典数据与 AI 内容必须分开存储**：AI 只能写 `word_ai_notes`（记忆技巧、更多例句、易混词、用法解释），**禁止**覆盖 `words`/`word_senses`/`word_examples` 等词典字段。
- **调度参数由服务端计算并保存**：客户端不得提交 `easeFactor`/`interval`/`dueAt` 等结果值；服务端只接受「答题事实」。
- **每次复习必须留全量记录**：包括时间、用时、对错、题目类型、评分映射、评分后的 `easeFactor`/`intervalDays`/`repetitions`，以便未来无损迁移到 FSRS。
- **幂等**：`POST /review/submit` 以 `eventId` 唯一约束兜底，重复提交（网络重试/离线补传）不得重复更新学习状态。
- **音频文件**：只允许通过 `StorageProvider` 访问；上传必须校验大小、扩展名、真实 MIME（文件头）与路径安全；业务代码不得拼接绝对路径。
- **错误与日志**：不泄露 SQLite 路径、存储根目录、堆栈、任何秘密。
- 未获批准不得安装额外系统工具（含音频处理工具如 ffmpeg；如需转码必须另行申请）。

---

## 1. 数据模型（Phase 2 新增表）

按 `docs/database-design.md` 的通用约定（TEXT 主键 UUIDv4、INTEGER UTC 毫秒、布尔为 0/1、外键显式 ON DELETE、服务端权威时间）。

### 1.1 词库与词条（词典数据）

| 表 | 关键列 | 说明 |
| --- | --- | --- |
| `wordbooks` | `id`, `key`(unique), `name`, `description`, `language`, `is_system`, `version`(int), `word_count`, `created_at`, `updated_at` | `key` 如 `cet4`/`cet6`；**不写死在代码**；`version` 随内容变化递增，供 Android 离线下载比对 |
| `words` | `id`, `headword`, `headword_canonical`(unique, 归一化), `phonetic_uk`, `phonetic_us`, `audio_uk_key`, `audio_us_key`, `source`('dictionary'/'imported'), `created_at`, `updated_at` | 词条为**全局共享**（一个词可属于多个词库）；音频只存 `StorageProvider` 的 key |
| `wordbook_entries` | `wordbook_id`, `word_id`, `rank`, `tags` | 复合主键；`rank` 用于词库内顺序教学；`tags` 如「高频」「熟词僻义」 |
| `word_senses` | `id`, `word_id`, `part_of_speech`, `definition_zh`, `definition_en`, `exam_meaning`, `sort_order` | `exam_meaning` 承载「四六级常考含义」 |
| `word_examples` | `id`, `word_id`, `sense_id`(nullable), `text_en`, `text_zh`, `audio_key`, `sort_order` | 例句及翻译 |
| `word_phrases` | `id`, `word_id`, `kind`('phrase'/'collocation'), `text`, `translation`, `sort_order` | 常见短语与常见搭配复用同一表，用 `kind` 区分 |
| `word_forms` | `id`, `word_id`, `form_type`('past'/'past_participle'/'plural'/'comparative'/'third_person'/'ing'/'other'), `value` | 词形变化 |
| `word_relations` | `id`, `word_id`, `relation_type`('synonym'/'antonym'/'confusable'), `target_word_id`(nullable), `target_text`(nullable) | 近义/反义/易混；目标词可暂未入库故允许 `target_text` |
| `word_ai_notes` | `id`, `word_id`(unique), `memory_tip`, `usage_note`, `extra_examples_json`, `confusable_note`, `provider`, `model`, `generated_at` | **AI 内容独立表**，永不覆盖词典字段 |

### 1.2 用户学习数据

| 表 | 关键列 | 说明 |
| --- | --- | --- |
| `user_word_states` | `user_id`, `word_id`, `status`('new'/'learning'/'review'/'mastered'), `ease_factor`(real), `interval_days`(real), `repetitions`(int), `lapses`(int), `due_at`(int), `last_reviewed_at`, `first_learned_at`, `total_reviews`, `correct_reviews`, `created_at`, `updated_at` | 复合主键 `(user_id, word_id)`；SM-2 状态唯一存储处 |
| `review_logs` | `id`, `user_id`, `word_id`, `event_id`(unique), `question_type`, `answer_raw`, `is_correct`(0/1), `rating`('again'/'hard'/'good'/'easy'), `duration_ms`, `answered_at`, `client_answered_at`, `ease_factor_after`, `interval_days_after`, `repetitions_after`, `due_at_after`, `source`('web'/'android'), `created_at` | 全量留痕，供未来 FSRS 迁移与统计 |
| `user_notebook` | `user_id`, `word_id`, `note`, `source`('manual'/'from_review'/'from_listening'), `added_at` | 生词本；复合主键 |
| `spelling_errors` | `id`, `user_id`, `word_id`, `review_log_id`, `expected`, `actual`, `error_types`(逗号分隔：`missing_letter`/`duplicate_letter`/`order_error`/`wrong_letter`), `created_at` | 常见错拼分类，用于提高该词后续复习权重 |

**不新增统计表**：学习历史与统计在 Phase 2 由 `review_logs` 聚合查询得出（避免过早引入聚合表与一致性负担）；若 Phase 3 出现性能需求再评估。

---

## 2. 复习算法（SM-2 变体，服务端权威）

评分映射（客户端提交「答题事实」，服务端映射为评分）：

| 场景 | 映射 |
| --- | --- |
| 答错 | `again` |
| 答对但用时超过该题阈值（默认 8s）或曾提示 | `hard` |
| 答对且用时正常 | `good` |
| 答对且用时很短（默认 ≤ 3s） | `easy` |

SM-2 更新（`packages/core/src/sm2.ts`，纯函数，可被服务端与测试复用）：

```
初始：easeFactor = 2.5, intervalDays = 0, repetitions = 0

again:  repetitions = 0; intervalDays = 0（当天再练）; lapses += 1
        easeFactor = max(1.3, easeFactor - 0.20)
hard:   repetitions += 1; intervalDays = max(1, intervalDays * 1.2)（首次为 1）
        easeFactor = max(1.3, easeFactor - 0.15)
good:   repetitions += 1
        intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 6 : round(intervalDays * easeFactor)
        easeFactor 不变
easy:   repetitions += 1
        intervalDays = repetitions === 1 ? 3 : repetitions === 2 ? 8 : round(intervalDays * easeFactor * 1.3)
        easeFactor = min(3.0, easeFactor + 0.15)

dueAt = answeredAt + intervalDays 天（again 为 answeredAt + 10 分钟，保证当天可再练）
掌握判定：repetitions >= 5 且 intervalDays >= 21 → status = 'mastered'
```

**拼写/听写加权**：`spelling_errors` 中记录的错误类型按权重降低 `easeFactor`（如 `order_error` 额外 -0.1），并在错拼后 7 天内提高该词的出现权重（查询时优先返回，不额外建表）。

---

## 3. API（Phase 2 新增）

### 3.1 词库与词条（需登录）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/wordbooks` | 可用词库列表（含 `key`/`name`/`version`/`wordCount`） |
| GET | `/wordbooks/:key/version` | 版本与词数，供 Android 判断是否需要重新下载 |
| GET | `/wordbooks/:key/words?cursor=&limit=` | 分页导出词条完整数据（供离线学习；`limit ≤ 200`） |
| GET | `/words/:id` | 词条详情（含释义/例句/短语/搭配/词形/关系/AI 补充） |
| GET | `/words/search?q=&wordbookKey=` | 搜索（用户名下可用，用于生词本与自测） |

### 3.2 学习与复习（需登录）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/study/next` | 取下一题：`{ mode: 'new'\|'review'\|'spelling'\|'dictation', wordbookKey?, limit? }`，返回题目（**不含正确答案**）与进度 |
| POST | `/review/submit` | 提交答题：`{ eventId, wordId, questionType, answer, durationMs, clientAnsweredAt? }` → 服务端判定并更新 SM-2，返回 `{ correct, correctAnswer, rating, nextDueAt, status }` |
| GET | `/review/due?limit=` | 今日待复习列表（`dueAt <= now`，按逾期时长排序） |
| GET | `/review/history?cursor=&limit=` | 复习历史分页 |
| GET | `/review/stats` | 基础统计：今日新学/复习数、正确率、平均用时、已掌握词数、生词本数量、近 7 日趋势 |

题型（`questionType`）：`definition_choice`（释义选择）、`en_to_zh`、`zh_to_en`、`spelling`、`listening_dictation`。**答案校验全部在服务端**；选择题的干扰项由服务端生成并随题目返回，正确答案不下发。

### 3.3 生词本（需登录）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/notebook?cursor=&limit=` | 生词本分页 |
| POST | `/notebook` | `{ wordId, note?, source? }` 加入（幂等） |
| DELETE | `/notebook/:wordId` | 移除 |

### 3.4 管理后台（需权限）

| 权限 | 接口 | 说明 |
| --- | --- | --- |
| `admin.wordbooks.read` | `GET /admin/wordbooks`、`GET /admin/wordbooks/:id` | 词库列表与详情 |
| `admin.wordbooks.write` | `POST /admin/wordbooks`、`PATCH /admin/wordbooks/:id`、`DELETE /admin/wordbooks/:id` | 词库增删改（删除为高风险，需二次确认 + 审计） |
| `admin.words.read` | `GET /admin/words?query=&wordbookId=&cursor=` | 词条检索 |
| `admin.words.write` | `POST /admin/words`、`PATCH /admin/words/:id`、`DELETE /admin/words/:id` | 词条 CRUD（含释义/例句/短语/词形/关系） |
| `admin.words.import` | `POST /admin/words/import` | 批量导入（JSON 数组；逐条校验、事务、返回成功/失败明细、写审计） |
| `admin.words.audio` | `POST /admin/words/:id/audio` | 上传音频（`multipart/form-data`，字段 `kind=uk\|us`） |

---

## 4. 文件存储（StorageProvider）

`apps/server/src/storage/`：

```
storage.provider.ts          # 接口：put(key, buffer, meta) / get(key) / delete(key) / exists(key) / resolvePublicUrl(key)
local-storage.provider.ts    # 本地实现：data/uploads 下按前缀分目录，文件名服务端生成
file-validation.ts           # 纯函数：扩展名白名单、真实 MIME（魔数）、大小上限、路径规范化断言
```

接口契约（未来 `S3StorageProvider` 需等价实现）：

```ts
export interface StorageProvider {
  put(input: { key: string; data: Buffer; contentType: string }): Promise<{ key: string; size: number }>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

安全要求（`SECURITY-GUARDRAILS.md` 第 6 节）：大小上限（音频 ≤ 5 MB）、扩展名白名单（`.mp3`/`.m4a`/`.ogg`）、**读取文件头校验真实 MIME**、服务端生成随机文件名、写入前断言最终路径仍在存储根内、`data/` 不入 Git 且不作为可执行静态目录暴露。

---

## 5. 任务清单

| # | 任务 | 说明 |
| --- | --- | --- |
| 1 | 共享包：SM-2 核心算法 | `packages/core/src/sm2.ts` + 单测（评分映射、四种评分的间隔/难度变化、边界与下限、掌握判定） |
| 2 | 共享包：题型与 DTO 契约 | `packages/types`：`QuestionType`、`ReviewRating`、`WordStatus`、题目/提交/统计的 DTO；`error-code` 增补 |
| 3 | 数据库：Phase 2 schema 与迁移 | 12 张新表 + 索引/唯一约束（`event_id` 唯一、`(user_id, word_id)` 复合主键等） |
| 4 | 存储层：StorageProvider 与上传安全 | 接口 + 本地实现 + `file-validation` 纯函数 + 单测（魔数/大小/扩展名/路径穿越） |
| 5 | 词库仓储与只读接口 | `wordbooks`/`words`/`wordbook_entries` 仓储 + `GET /wordbooks`、`/version`、`/words` 分页导出、`/words/:id`、`/words/search` |
| 6 | 种子数据：CET-4 / CET-6 | 结构化 JSON（许可明确的自制/公开数据），含释义、音标、例句、短语、搭配、词形、关系、常考含义；导入脚本 |
| 7 | 学习状态仓储与 SM-2 接入 | `user_word_states` + `review_logs` 仓储；`/review/submit` 幂等落库（`eventId` 唯一约束） |
| 8 | 出题与判定 | `/study/next` 五种题型的题目生成（含干扰项）与答案服务端判定；选择题不下发答案 |
| 9 | 拼写与听写 | `spelling`/`listening_dictation` 题型、错拼分类（漏字母/重复/顺序/错字母）、加权复习 |
| 10 | 生词本 | `/notebook` 增删查 + 幂等 + IDOR 校验 |
| 11 | 学习历史与统计 | `/review/history`、`/review/stats`（今日/正确率/平均用时/已掌握/近 7 日趋势） |
| 12 | 管理后台接口 | RBAC 新权限 + 词库/词条 CRUD + 批量导入 + 音频上传（含安全校验与审计） |
| 13 | Web 端单词模块 | 新词卡片学习、多题型复习、拼写/听写、生词本、统计页；复用 Phase 1 设计体系 |
| 14 | Admin 端词库管理 | 词库列表/新建/编辑、词条检索与编辑、批量导入（含错误明细）、音频上传 |
| 15 | Android 端单词模块 | 词库下载（离线读取）、新词与复习界面、拼写/听写、生词本；Metro/构建保持可用 |
| 16 | Phase 2 验收 | 全量 test/lint/typecheck/build + 浏览器与 Android 实测、安全自检、`docs/phase-2-acceptance.md`、`HANDOFF.md` 更新 |

---

## 6. Phase 2 验收标准

| # | 验收项 | 证据形式 |
| --- | --- | --- |
| 1 | `npm run typecheck` / `lint` / `build` 全仓库通过 | 命令 + 退出码 |
| 2 | `npm run test` 全仓库通过，用例数显著高于 Phase 1（≥ 180） | 各 workspace 摘要 |
| 3 | SM-2：四种评分的间隔/难度变化、下限 1.3、掌握判定均有单测 | 测试名称 + 结果 |
| 4 | 复习提交幂等：同一 `eventId` 重复提交只更新一次状态（含并发场景） | 测试名称 + 结果 |
| 5 | 答案不由客户端决定：选择题响应中**不含**正确答案；提交后由服务端返回判定 | 测试断言 + 实测响应 |
| 6 | 词库可扩展：新增第三个词库（测试内构造）无需改任何业务分支即可出现在 `/wordbooks` 并被学习 | 测试名称 + 结果 |
| 7 | 词典数据与 AI 内容分离：`word_ai_notes` 不影响 `words`/`word_senses` 字段 | 测试断言 |
| 8 | 上传安全：伪造扩展名（如 `.mp3` 实为文本）被拒绝；超大文件被拒绝；路径穿越 key 被拒绝 | 测试名称 + 结果 |
| 9 | 生词本越权：无法读取/删除他人条目（404 语义） | 测试名称 + 结果 |
| 10 | 后台词库能力：非权限用户 403；批量导入返回逐条结果并写审计；高风险删除有二次确认 | 测试 + 浏览器实测 |
| 11 | Web：新词学习、复习、拼写、听写、生词本、统计页在浏览器中真实跑通（含刷新后学习进度保持） | 手动验证记录 |
| 12 | Android：`assembleDebug` 仍成功；词库下载与离线读取逻辑有单测 | 命令输出 + APK |
| 13 | 审计与日志不含秘密；错误响应不泄露内部路径 | 抽样验证 |
| 14 | `docs/api.md`、`docs/database-design.md`、`HANDOFF.md`、`docs/phase-2-acceptance.md` 与实际实现一致 | 人工复核 |

---

## 7. 明确不在 Phase 2 范围

- 学习积分、金币、宠物 EXP、连续学习、Reward Ledger（Phase 3）。
- 听力内容与模考（Phase 4）、AI 口语与 TTS 生成音频（Phase 5）、勋章与通知（Phase 6）、离线同步队列与冲突处理（Phase 7，Phase 2 只做「已下载词库的本地读取」）。
- 每日学习目标设置界面（Phase 3；Phase 2 用服务端默认值：新词 20/天、复习不限）。
