# Leximochi API（Phase 1）

> 本文件描述**已实现**的接口。实现变化时同步更新；与代码不一致时以代码为准。
> 统一前缀：无（由部署层决定是否加 `/api`）。默认端口由 `PORT` 决定，本地开发为 `3100`。

- 版本：Phase 1
- 更新时间：2026-09-22

---

## 1. 通用约定

### 1.1 响应包裹

成功：

```json
{ "data": { } }
```

失败：

```json
{ "error": { "code": "AUTH_INVALID_CREDENTIALS", "message": "用户名或密码不正确", "requestId": "…" } }
```

- `code` 取自 `@leximochi/types` 的 `ErrorCode`，客户端据此分支；`message` 可直接展示给用户。
- 错误响应**不含**堆栈、SQL、文件路径、环境变量或任何凭证。
- 每个响应都带 `x-request-id`（服务端生成，或沿用请求头中合法的 `x-request-id`），排查问题时以此对齐服务端日志与审计。

### 1.2 认证

- 受保护接口需带 `Authorization: Bearer <accessToken>`。
- Access Token：JWT（HS256），默认 15 分钟（`ACCESS_TOKEN_TTL_SECONDS`）。
- Refresh Token：不透明随机串。**传输方式由请求头 `x-client-type` 决定**：
  - `x-client-type: mobile` → refresh token 出现在响应体，客户端自行安全存储；
  - 其它/缺省 → refresh token 写入 `HttpOnly` Cookie（`leximochi_rt`，仅 `/auth` 路径，`SameSite=Lax`），响应体**不含**该字段。
  - 该请求头**只影响传输方式，不授予任何权限**。
- 权限每次请求从数据库读取，因此封禁/降权立即生效。

### 1.3 CSRF

携带 `leximochi_rt` Cookie 的**非幂等请求**必须带合法的 `Origin`（须在 `CORS_ORIGINS` 白名单内），否则 `403 FORBIDDEN`。不使用 Cookie 的客户端（移动端）不受此限制。

### 1.4 限流与锁定

| 场景 | 策略 | 超限响应 |
| --- | --- | --- |
| 全站 | 120 请求 / 分钟 / IP | `429 RATE_LIMITED` |
| 登录（按用户名） | 15 分钟内失败 5 次 | `429 AUTH_ACCOUNT_LOCKED` |
| 登录（按 IP） | 15 分钟内失败 20 次 | `429 RATE_LIMITED` |
| 注册（按 IP） | 1 小时内失败 10 次 | `429 RATE_LIMITED` |
| 恢复码（按用户名） | 1 小时内失败 5 次 | `429 RATE_LIMITED` |
| 获取验证码（按 IP） | 10 分钟内 30 次 | `429 RATE_LIMITED` |

阈值与窗口来自环境变量，不硬编码。

---

## 2. 公开接口

### GET /health

存活检查。

```json
{ "data": { "status": "ok", "uptimeSeconds": 12 } }
```

### POST /auth/captcha

签发人机验证挑战（服务端签名，TTL 120 秒，一次性，绑定来源 IP）。

响应：

```json
{ "data": { "token": "<base64url>.<hmac>", "question": "45 + 66 = ?", "expiresAt": 1790000000000 } }
```

### POST /auth/register

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `username` | string | 3–24 位；小写字母/数字/下划线/连字符；非纯数字；非保留名 |
| `password` | string | 10–128 位；至少 3 类字符；不在常见弱密码表；不含用户名 |
| `captchaToken` | string | 来自 `/auth/captcha` |
| `captchaAnswer` | string | 挑战答案 |

成功（201）：`{ "data": { "user": PublicUser, "recoveryCodes": ["XXXX-XXXX-XXXX", …×10] } }`
**恢复码仅此一次返回**；服务端只保存 Argon2id 哈希。

错误：`400 VALIDATION_FAILED`（字段不合规，`details` 含原因）、`400 CAPTCHA_FAILED`、`409 AUTH_USERNAME_TAKEN`。

### POST /auth/login

`{ "username": string, "password": string }`

成功（200）：`{ "data": { "accessToken": string, "expiresIn": 900, "user": PublicUser[, "refreshToken": string（仅 mobile）] } }`

错误：`401 AUTH_INVALID_CREDENTIALS`（**不区分**账号不存在与密码错误）、`403 AUTH_ACCOUNT_BANNED`、`429 AUTH_ACCOUNT_LOCKED`。

### POST /auth/refresh

`{ "refreshToken"?: string }`（mobile 走 Body；Web/Admin 走 Cookie，可省略）

成功（200）：`{ "data": { "accessToken": string, "expiresIn": number[, "refreshToken": string（仅 mobile）] } }`

错误：`401 AUTH_TOKEN_INVALID`、`401 AUTH_TOKEN_EXPIRED`、`401 AUTH_TOKEN_REUSE_DETECTED`（旧 token 被重复使用，该会话族已被全部撤销）、`403 AUTH_ACCOUNT_BANNED`。

### POST /auth/recovery

| 字段 | 说明 |
| --- | --- |
| `username` | 用户名 |
| `recoveryCode` | 恢复码，大小写与连字符不敏感 |
| `newPassword` | 新密码（策略同注册） |
| `captchaToken` / `captchaAnswer` | 同上 |

成功（200）：`{ "data": { "user": PublicUser, "recoveryCodes": [...新的一组 10 个...] } }`
副作用：该用户**全部会话被撤销**，旧恢复码整组作废。

错误：`400 VALIDATION_FAILED`（弱新密码，**不消耗**恢复码）、`400 AUTH_RECOVERY_CODE_INVALID`（无效/已用；用户不存在时返回同一错误码以免枚举）。

---

## 3. 需要登录的接口

### POST /auth/logout

`{ "refreshToken"?: string }`（可选；提供时会与会话比对，不匹配则 401）。撤销当前会话并清除 Cookie。
成功：`{ "data": { "ok": true } }`

### POST /auth/logout-all

撤销该用户全部会话（当前会话也被撤销）。成功：`{ "data": { "ok": true } }`

### GET /auth/me

```json
{ "data": { "user": PublicUser, "permissions": ["admin.users.read"] } }
```

### GET /auth/sessions

```json
{ "data": [ { "id": string, "userAgent": string|null, "ip": string|null, "createdAt": number, "lastUsedAt": number|null, "isCurrent": boolean } ] }
```

### DELETE /auth/sessions/:id

删除自己的某个会话（对方需重新登录）。**他人会话与不存在的会话一律返回 `404 AUTH_SESSION_NOT_FOUND`**（避免泄露会话是否存在）。
成功：`{ "data": { "ok": true } }`

---

## 4. 管理后台接口（需要对应权限）

所有 `/admin/*` 对**非管理员一律 `403 FORBIDDEN`**；未登录为 `401`。变更类操作写入审计日志。

| 权限 | 接口 | 说明 |
| --- | --- | --- |
| `admin.users.read` | `GET /admin/users?query=&status=&limit=&cursor=` | 检索用户；`query` 对用户名做 `LIKE` 匹配（通配符已转义）；`limit` 1–100，默认 20 |
| `admin.users.read` | `GET /admin/users/:id` | 单个用户摘要 |
| `admin.users.ban` | `POST /admin/users/:id/ban` | Body `{ "reason": string(2–200) }`；撤销该用户全部会话；写审计 `admin.user.banned`；**禁止封禁自己**（400） |
| `admin.users.ban` | `POST /admin/users/:id/unban` | 解封；**不恢复**旧会话；写审计 `admin.user.unbanned` |
| `admin.audit.read` | `GET /admin/audit-logs?action=&actorUserId=&targetId=&targetType=&limit=&cursor=` | 只读审计查询 |

分页响应：

```json
{ "data": { "items": [...], "nextCursor": "base64url 游标 或 null" } }
```

用户摘要**不包含**任何凭证字段：

```json
{ "id": string, "username": string, "status": "active"|"banned", "roles": string[], "createdAt": number, "lastLoginAt": number|null }
```

---

## 5. 审计事件（Phase 1）

| action | 触发 |
| --- | --- |
| `auth.register.succeeded` / `auth.register.failed` / `auth.register.rolled_back` | 注册 |
| `auth.login.succeeded` / `auth.login.failed` / `auth.login.locked` | 登录 |
| `auth.logout.succeeded` / `auth.logout_all.succeeded` | 登出 |
| `auth.token.reuse_detected` | Refresh token 复用检测 |
| `auth.recovery.succeeded` / `auth.recovery.failed` | 恢复码 |
| `admin.user.banned` / `admin.user.unbanned` | 后台用户管理 |
| `admin.bootstrap.created` / `admin.bootstrap.role_granted` | 管理员初始化脚本 |

审计记录只保存脱敏后的元数据；**禁止**写入密码、恢复码、Token、API Key 或完整请求体。

---

## 6. 错误码清单

| code | HTTP | 含义 |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | 入参不合规（`details` 给出字段原因） |
| `CAPTCHA_FAILED` | 400 | 人机验证失败 |
| `AUTH_RECOVERY_CODE_INVALID` | 400 | 恢复码无效或已使用 |
| `UNAUTHORIZED` | 401 | 未登录 |
| `AUTH_INVALID_CREDENTIALS` | 401 | 用户名或密码错误 |
| `AUTH_TOKEN_INVALID` | 401 | Token 无效或会话已失效 |
| `AUTH_TOKEN_EXPIRED` | 401 | 登录已过期 |
| `AUTH_TOKEN_REUSE_DETECTED` | 401 | 检测到凭证复用，已撤销会话族 |
| `AUTH_ACCOUNT_BANNED` | 403 | 账号被封禁 |
| `FORBIDDEN` | 403 | 无权限 / 请求来源不被允许 |
| `NOT_FOUND` / `USER_NOT_FOUND` / `AUTH_SESSION_NOT_FOUND` | 404 | 资源不存在或不可见 |
| `AUTH_USERNAME_TAKEN` | 409 | 用户名已被使用 |
| `AUTH_ACCOUNT_LOCKED` | 429 | 登录失败次数过多，已临时锁定 |
| `RATE_LIMITED` | 429 | 请求过于频繁 |
| `CONFLICT` | 409 | 通用冲突 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误（细节只进服务端日志） |

---

## 7. 词库与词条（Phase 2，需登录）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/wordbooks` | 可用词库列表：`id`/`key`/`name`/`description`/`language`/`version`/`wordCount`/`isSystem`。**词库是数据**：新增词库无需改代码 |
| GET | `/wordbooks/:key/version` | `{ key, version, wordCount, updatedAt }`，供 Android 判断是否需要重新下载 |
| GET | `/wordbooks/:key/words?cursor=&limit=` | 分页导出完整词条（含释义/例句/短语搭配/词形/关系）用于离线学习；`limit` 1–200，默认 50；游标为 `wordId` 升序 |
| GET | `/words/search?q=&wordbookKey=&limit=` | 按词形搜索；`q` 的 LIKE 通配符已转义；`limit` 1–50，默认 20 |
| GET | `/words/:id` | 词条详情：词典字段 + **独立的 AI 补充** `aiNotes` + 当前用户 `state`（未学过为 `null`） |

说明：
- 音频只以 `StorageProvider` 的 key 形式返回（如 `words/uk/xxx.mp3`），**绝不返回服务器绝对路径**；播放地址由后续鉴权接口换取。
- 错误：未知词库 `404 WORDBOOK_NOT_FOUND`、未知词条 `404 WORD_NOT_FOUND`；未登录 `401`。

---

## 8. 学习与复习（Phase 2，需登录）

### POST /review/submit

提交一次答题。**判定与调度完全由服务端完成**：客户端只提交「答题事实」。

请求：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `eventId` | string(8–64) | **幂等键**，客户端生成；网络重试/离线补传必须复用同一个值 |
| `wordId` | string(1–64) | 词条 ID |
| `questionType` | enum | `definition_choice` / `en_to_zh` / `zh_to_en` / `spelling` / `listening_dictation` |
| `answer` | string(≤200) | 用户原始输入（文本或选项内容） |
| `durationMs` | int(0–600000) | 答题用时，仅用于映射评分 |
| `clientAnsweredAt` | int | 可选，仅作分析记录，**不参与业务判定** |

响应（200）：

```json
{ "data": {
  "correct": true,
  "correctAnswer": "abandon",
  "rating": "good",
  "state": { "status": "learning", "easeFactor": 2.5, "intervalDays": 1, "repetitions": 1,
             "lapses": 0, "dueAt": 1790000000000, "lastReviewedAt": 1790000000000,
             "totalReviews": 1, "correctReviews": 1 },
  "spellingErrors": []
} }
```

服务端规则：

- **评分映射**（客户端不可提交评分）：答错 → `again`；答对且用时 ≤3s → `easy`；≥8s → `hard`；其余 → `good`。
- **SM-2 更新**：`again` 重置重复次数、遗忘计数 +1、10 分钟后可再练；`good` 第 1/2 次间隔为 1/6 天、之后按难度因子放大；`easy` 为 3/8 天并提升难度；`hard` 间隔 ×1.2 并降低难度；难度因子限制在 1.3–3.0。
- **幂等**：同一 `eventId` 重复提交不会二次推进学习状态，也不重复写流水（以 `review_logs.event_id` 唯一约束兜底）；重试返回与首次一致的结果。
- **留痕**：每次提交写入 `review_logs`，包含评分后的 `easeFactor`/`intervalDays`/`repetitions`/`dueAt`，供未来迁移 FSRS。
- **错拼记录**：拼写/听写答错时按形态分类（`missing_letter`/`duplicate_letter`/`order_error`/`wrong_letter`）写入 `spelling_errors`，用于提高该词后续出现权重。
- **错拼追加惩罚**：在「答错」本身的难度惩罚（−0.20）之外，按错拼类型再降难度（`order_error` −0.10、`missing_letter`/`duplicate_letter` −0.05、`wrong_letter` −0.03，同一次答题可累加），下限仍为 1.3；错拼后的词在 7 天内于复习中优先出现。
- **不可信输入**：请求体中的 `rating`/`easeFactor`/`intervalDays` 等字段会被 DTO 白名单直接拒绝（400）。

错误：`404 WORD_NOT_FOUND`、`400 VALIDATION_FAILED`、未登录 `401`。

### GET /review/spelling-errors

错拼清单：按词条聚合当前用户的错拼次数与分类，按最近错拼时间倒序。**数据范围严格限定为当前登录用户**（查询条件带 `user_id`，越权不可见）。

请求参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `limit` | int? | 返回的词条数，默认 30，范围 1–100 |

响应（200）：

```json
{ "data": {
  "items": [
    { "wordId": "uuid", "headword": "abruptly", "lastActual": "aburptly",
      "errorCounts": { "missing_letter": 1, "duplicate_letter": 0, "order_error": 1, "wrong_letter": 0 },
      "totalCount": 2, "firstAt": 1790000000000, "lastAt": 1790003600000 }
  ],
  "total": 1
} }
```

说明：

- `total` 是**错拼过的词条总数**（不受 `limit` 影响），`items` 是按 `limit` 截断后的明细。
- `lastActual` 是最近一次的错误输入，供用户回看自己错在哪。
- 全部使用绑定参数查询；`word_id` 列表由服务端生成，不接受客户端输入。

错误：`400 VALIDATION_FAILED`（`limit` 越界）、未登录 `401`。

### POST /study/next

取下一题。返回的题目**不含正确答案**（判定一律在 `/review/submit` 由服务端完成）。

请求：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `mode` | enum | `new`（新词）/ `review`（到期复习）/ `spelling`（拼写训练）/ `dictation`（听写训练） |
| `wordbookKey` | string? | 可选；缺省时用默认词库（系统词库优先） |

响应（200）：

```json
{ "data": {
  "question": {
    "questionId": "uuid",
    "wordId": "uuid",
    "questionType": "definition_choice",
    "mode": "new",
    "prompt": "abandon",
    "phonetic": "/əˈbændən/",
    "audioKey": null,
    "options": ["放纵", "放弃；抛弃", "能力；才能", "吸收"],
    "requiresInput": false
  },
  "progress": { "newRemaining": 4543, "dueRemaining": 12, "learnedToday": 1,
                "reviewedToday": 0, "dailyNewTarget": 20 },
  "notice": null
} }
```

选词与出题规则：

- `new`：指定/默认词库中**尚未学过**的词，按词库内 `rank` 升序；达到每日新词目标（默认 20）后返回 `question: null` 并在 `notice` 中说明。
- `review`：已到期（`dueAt <= now`）的词，**近 7 天内错拼过的词优先**，其余按逾期时长排序。
- `spelling`：从已学过的词中出拼写题（题干给中文释义 + 音标提示）。
- `dictation`：从已学过**且有音频**的词中出题；当前词库无音频时返回 `question: null` 且 `notice` 明确说明，**不静默失败**。
- 五种题型：`definition_choice`（看词选释义，4 选项）、`en_to_zh`（看词输入中文）、`zh_to_en`（看中文输入英文）、`spelling`（拼写，含音标）、`listening_dictation`（听音写词，需音频）。
- 选择题干扰项来自**其他词条**的释义并去重；输入型题目的题干与选项**绝不包含答案词形**。
- 复习题题型按词条 ID 稳定轮换，保证同一词多次练习时题型可预期。
- `progress.newRemaining` 表示该词库**还剩多少没学过的词**；每日目标进度由 `learnedToday` / `dailyNewTarget` 表达。
