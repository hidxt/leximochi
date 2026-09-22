# Leximochi（词团子）

Gamified English learning with vocabulary, AI speaking, listening practice, and a virtual pet companion.

- 需求与开发约束基线：`开发提示词.md`
- 安全红线：`SECURITY-GUARDRAILS.md`
- 当前状态与交接：`HANDOFF.md`
- 架构与数据库：`docs/architecture.md`、`docs/database-design.md`
- 阶段计划：`docs/plans/`
- 接口清单：`docs/api.md`
- Android 构建（含全新克隆后的完整步骤与调试密钥生成命令）：`docs/android-build.md`
- Phase 验收报告：`docs/phase-1-acceptance.md`

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
