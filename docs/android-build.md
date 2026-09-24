# Android 构建说明

> 适用于 `apps/mobile`（React Native 0.87.1 Android 端）。
> 本文件记录**全新克隆仓库后从零完成 Debug 构建**所需的全部步骤，命令均已在本机实测通过。

- 最近验证：2026-09-22，`BUILD SUCCESSFUL in 20m 16s`，产出 `app-debug.apk`（约 117 MB，含 4 个 ABI）
- 版本基线：Gradle 9.4.1（wrapper）· AGP 9.2.1 · Kotlin 2.2.0 · compileSdk 37 / targetSdk 36 / buildTools 37.0.0 / NDK 27.1.12297006 · minSdk 24

---

## 1. 前置条件

| 依赖 | 要求 | 检查命令 |
| --- | --- | --- |
| Node.js | ≥ 24.3.0（RN 0.87 要求 `^22.13 \|\| ^24.3 \|\| >=26`） | `node -v` |
| JDK | 17（AGP 9.2.1 最低要求 JDK 17） | `java -version` |
| Android SDK | 需含 `platforms/android-37`、`build-tools/37.0.0`、`ndk/27.1.12297006`、`platform-tools` | `ls "$ANDROID_HOME"` |
| 环境变量 | `ANDROID_HOME` 指向 SDK（`ANDROID_SDK_ROOT` 可留空）；`JAVA_HOME` 指向 JDK 17 | `echo "$ANDROID_HOME"` |

> 本机实测环境：`ANDROID_HOME=C:\Users\auzasr\AppData\Local\Android\Sdk`、JDK 17.0.20.1。
> 若缺少上述 SDK 组件，需先向项目负责人申请后再通过 `sdkmanager` 安装（属需批准范围）。

---

## 2. 全新克隆后的构建步骤

```bash
# 1) 在仓库根安装全部 workspace 依赖（含 react-native 及其传递依赖）
npm install

# 2) 生成 Android 调试签名密钥（见第 3 节，必须本地生成，仓库不含该文件）
cd apps/mobile/android/app
keytool -genkeypair -v -keystore debug.keystore \
  -storepass android -alias androiddebugkey -keypass android \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Android Debug,O=Android,C=US"
cd ..

# 3) 构建 Debug APK（首次会下载 Gradle 发行包与 Maven 依赖，耗时较长）
cd apps/mobile/android && ./gradlew assembleDebug
```

产物：`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

也可从仓库根执行：

```bash
npm run build:android -w @leximochi/mobile
```

> 若 `keytool` 不在 PATH，使用 `"$JAVA_HOME/bin/keytool"`。

---

## 3. 关于调试密钥（重要）

- **`android/app/debug.keystore` 不入库**。这是 `SECURITY-GUARDRAILS.md` 的硬性要求：任何 `*.keystore` / `*.jks` 都不得提交，**RN 模板的公开调试密钥也不设例外**。
- 该文件由每位开发者在本地按第 2 节的 `keytool` 命令生成；`apps/mobile/.gitignore` 与其注释里保留了同一命令作为提醒。
- `android/app/build.gradle` 中的 `signingConfigs.debug` 固定引用该文件名与 Android 官方调试口令（`android` / `androiddebugkey`），所以本地生成后即可直接构建。
- **正式发布签名密钥永远不得进入仓库**：release 构建请在仓库之外保管密钥，并通过环境变量 / 本地 `keystore.properties`（同样不入库）注入。当前模板的 `release` 构建仍复用 debug 签名配置，仅用于开发验证，**不可用于对外发布**。

---

## 4. monorepo 相关配置（npm workspaces）

npm workspaces 会把 `react-native` 及其传递依赖提升到**仓库根** `node_modules`，因此以下两处做了显式适配，改动已入库，新克隆无需再改：

1. `apps/mobile/android/settings.gradle`
   `@react-native/gradle-plugin` 在「`apps/mobile/node_modules`」与「仓库根 `node_modules`」两处查找。
   注意：Gradle 要求该逻辑写在 `pluginManagement {}` 内（`plugins {}` 之前不允许普通语句），且 `includeBuild` 传相对路径**字符串**。
2. `apps/mobile/android/app/build.gradle` 的 `react {}` 块
   显式设置 `root` / `reactNativeDir` / `codegenDir` / `cliFile` 指向仓库根，否则 RNGP 默认路径 `../../node_modules/react-native` 不存在，构建会在配置阶段失败。
3. `apps/mobile/metro.config.js`
   `watchFolders` 指向仓库根，`nodeModulesPaths` 同时包含本地与仓库根，并开启 `disableHierarchicalLookup`，保证 JS 打包能解析工作区包。

---

## 5. 网络与代理

- `apps/mobile/android/gradle.properties` 已配置**项目范围**代理（`127.0.0.1:10808`），并通过 `nonProxyHosts` 让可直连的域名（`dl.google.com`、`services.gradle.org`、`repo.maven.apache.org`、npm 源、localhost）**不走代理**。
- 网络实测（2026-09-24 复测）：`repo.maven.apache.org` **直连可用**（200），经本机代理反而不可用（000），因此 Maven Central 也列入直连名单；`dl.google.com` 与 `services.gradle.org` 直连可用。
- 若将来某仓库直连超时，按项目规则「代理优先、失败切直连」处理：从 `nonProxyHosts` 中移除该域名即可恢复走代理；不要修改系统级/全局代理配置。
- 若代理未启动，构建仍可完成（官方 Google 源直连可用）；若某仓库确实无法访问，按项目规则「代理优先、失败切直连」，不要修改系统级/全局代理配置。

---

## 6. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| `Included build '…/apps/mobile/node_modules/@react-native/gradle-plugin' does not exist` | 依赖未在仓库根安装：先在仓库根执行 `npm install` |
| `Failed to apply plugin 'com.facebook.react.rootproject' … ReactAndroid/gradle.properties` | `reactNativeDir` 未指向仓库根，检查第 4 节第 2 项是否被回退 |
| `storeFile … debug.keystore` 相关报错 | 本地尚未生成调试密钥，按第 2 节第 2 步生成 |
| 构建耗时很长（首次 20 分钟左右） | 首次需下载 Gradle 发行包与全部 Maven 依赖；后续增量构建明显更快 |

---

## 7. 运行验证现状

本机 `adb devices` 为空、且未创建 AVD，因此 Phase 1 的 Android 验收仅覆盖**可构建**（产出 APK）。
连接真机或创建模拟器后，可执行：

```bash
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
# 或
npm run android -w @leximochi/mobile
```

App 内默认访问 `http://10.0.2.2:3100`（模拟器访问宿主机约定地址）；真机调试需把 `apps/mobile/src/lib/api.ts` 的 `API_BASE_URL` 改为宿主机局域网 IP，并确保服务端 `CORS_ORIGINS` 允许对应来源。
