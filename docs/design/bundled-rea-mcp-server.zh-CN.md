# 内置 REA 逆向工程服务器

[English](bundled-rea-mcp-server.md) | [简体中文](bundled-rea-mcp-server.zh-CN.md)

## 问题

`rea` skill（Reverse Engineer Anything）依赖一个需要用户自行安装的 MCP 服务器。在它注册之前，skill 会要求 agent 停止，因此全新安装只有文档而没有引擎：`analyze-*` 工具不可用，所有逆向工程请求都停在安装步骤上。

## 当前状态

- `rea` 与 `rea-install` 是位于 `packages/core/src/skills/bundled/` 的内置 skill。
- CLI 不随附任何 `mcpServers.rea` 条目，因此该引擎从不被注册。
- CLI 已有内置服务器的先例：Mem0 由 esbuild 构建到 `dist/mem0/main.js`，并由 `createBundledMem0Server` 注册在顶层。

## 目标

- 源码安装结束后即拥有可用的 `rea` MCP 服务器，无需任何手动步骤。
- 不需要逐次调用确认，也不需要 settings 条目。
- 无法携带该引擎的安装仍能得到可用的 CLI。

## 非目标

- 将引擎发布进 npm 包。`scripts/prepare-package.js` 拒绝解包后超过 160 MB 的包；仅 REA 就有 189,641,205 字节、10,585 个文件。
- 将 REA 源码树纳入 vendor 并在本地构建。在该源码树上运行 `tsc` 在开发机上 55 分钟仍未完成，且尝试构建需要 723 MB 的开发依赖安装。

## 方案

`vendor/rea` 存放已发布的 `rea-agents@6.9.0` 包——即 REA 项目发布的编译产物——由 `scripts/build-rea.js` 物化：

1. 将 `npm pack rea-agents@6.9.0` 拉取到暂存目录，解压，并把 `package/` 移动到 `vendor/rea`。
2. 在 `vendor/rea` 内执行 `npm install --omit=dev --omit=optional --ignore-scripts`。
3. 校验 `node scripts/rea.mjs --version`。

该脚本接入 `npm run build`，因此在全新克隆上执行 `npm install`（会运行 `prepare` → `build` → `bundle`）即会物化它。它从不使构建失败：任何错误都只告警并以 0 退出，服务器保持未注册。

第 2 步每次运行都会执行，而不是仅在 `node_modules` 缺失时执行。REA 发布的 manifest 不声明任何 `devDependencies`，因此在 `vendor/rea` 内执行 `npm ci` 所生成的依赖树无法按名称区分——只能按体积区分，大约多出 600 MB。无条件重算，是唯一在目录以任何方式被填充时都成立的检查。

`packages/cli/src/config/rea-settings.ts` 负责解析入口并构造服务器配置：

1. `REA_MCP_ENTRY`——用于仓库之外的独立 checkout 的显式覆盖。
2. 从工作目录与该模块所在目录向上遍历，直到存在 `vendor/rea/scripts/rea.mjs`。

`loadCliConfig` 将结果以 `rea` 之名注册进 `topTierMcpServers`，与 `--mcp-config` 并列。

## 设计决策

- **使用已发布的 tarball，而非本地源码构建。** tarball 携带项目发布的同一份编译产物，且只需数秒而非数小时即可物化。
- **`vendor/` 为生成物并加入 git 忽略。** 提交 190 MB（外加 95 MB 依赖树）会永久膨胀每次克隆；`build-rea.js` 可按固定版本重建它。
- **放在顶层，而非 settings。** 同名 settings 或 `.mcp.json` 条目不得降级内置引擎，project/workspace 审批门也不得拦截它：该二进制是本 CLI 自带的，而非某个仓库编写的配置。这与 Mem0 的注册方式一致。
- **始终注册。** 用户选择即插即用，而非可选启用。
- **`trust: true`。** 分析工具无需逐次确认即可使用；可检查什么由 REA skill 自身的规则约束，而非 MCP 门控。
- **缺失时优雅降级。** 运行时缺失只会让服务器不注册，而不会使启动失败，因此上游 checkout 与离线安装不受影响。

## 约束

- REA 要求 Node `^22.23.4`、`^24.22.1` 或 `>=26.12.1`；CLI 自身的下限更低，因此较旧的 Node 会注册一个在向准入阶段即退出的服务器。
- 首次物化需要网络访问与约 285 MB 磁盘（190 MB 包体、95 MB 依赖）。
- 原生二进制分析还需要用户自行安装的反编译器（Ghidra、IDA、Hopper 或 Kuna）。

## 风险

- **固定版本漂移。** REA 版本之间 MCP 工具目录会变化；`REA_VERSION` 需谨慎提升，`REA_MCP_ENTRY` 允许在未发版的情况下测试更新的 checkout。
- **静默降级。** 拉取失败会没有服务器且只有一条告警。`npm run build:rea` 是文档化的修复方式，`/rea-install` 会说明这一点。

## 验证

- `packages/cli/src/config/rea-settings.test.ts`（7 个用例）覆盖覆盖优先级、覆盖失效、从工作区锚点与从 esbuild `dist/chunks/` 锚点向上遍历 vendor，以及无运行时四种情形。
- 已通过 stdio 探测 vendored 入口：`initialize` 加 `tools/list` 返回 255 个工具（例如 `annotate_native_function`），并通过 `createMcpClient` 完成同一握手，耗时约 0.7 秒。
- `node scripts/build-rea.js` 输出 `vendored REA 6.9.0 is ready`；强制冷启动（`--force`）在 25 秒内完成拉取、安装与入口校验，最终得到 160.0 MB / 10.605 个文件的依赖树。
- 在 `vendor/rea/node_modules` 中植入一个哨兵包，被重算步骤清除；之后运行时仍以 255 个工具响应 `tools/list`。
- `packages/cli` 的 `tsc --build`、变更文件的 ESLint 与 Prettier，以及 `rea-settings.test.ts` + `config.test.ts`（598 个用例）均通过。
- 加载真实配置（`loadCliConfig`）只注册一个服务器 `rea`，指向 `vendor/rea/scripts/rea.mjs`。

## 验收标准

- 在全新克隆上执行 `npm install` 后，`/mcp` 会列出 `rea` 及其工具。
- 在没有 `vendor/rea` 的 checkout 上执行 `npm run build` 仍会成功并启动。
- 服务器不会落后于用户自定义的 `rea` 条目，也没有审批对话框拦截它。

## 后续

- 原生反编译器检测交由 `rea doctor`；在启动时展示其结果尚未实现。
- 将引擎发布进 npm 包，需要裁剪 REA 子集或提高 `scripts/prepare-package.js` 的体积门槛；两者均未尝试。
