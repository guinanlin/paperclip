# Paperclip 适配器架构 — 外部 AI 编码工具集成技术文档

> 本文档详细解释 Paperclip 如何调用和管理外部 AI 编码工具：**OpenCode**、**Cursor**、**Claude Code**、**Pi (Pi Local)** 等。

## 1. 概述

Paperclip 是一个面向 AI Agent 公司的**控制平面**。它不直接运行 LLM 推理，而是通过**适配器模式**将执行委托给本地 CLI 工具。每个受支持的工具有一个对应的适配器包，负责：

- **启动**工具作为子进程
- **传递提示词**和**构建 CLI 参数**
- **解析**工具的 stdout/stderr 为结构化结果
- 跨心跳周期**恢复会话**
- 将 Paperclip 的 skills **注入**到工具的 skill 目录
- 运行前**测试环境**
- 在 UI 和 CLI 中**渲染**实时转录

适配器代码位于 `packages/adapters/<tool-name>/`，并在中心注册表（`server/src/adapters/registry.ts`）中注册。

### 支持的适配器

| 类型 | 包名 | CLI 工具 | 默认命令 |
|------|------|----------|----------|
| `opencode_local` | `@paperclipai/adapter-opencode-local` | OpenCode | `opencode` |
| `cursor` | `@paperclipai/adapter-cursor-local` | Cursor Agent CLI | `agent` |
| `claude_local` | `@paperclipai/adapter-claude-local` | Claude Code | `claude` |
| `pi_local` | `@paperclipai/adapter-pi-local` | Pi Local | `pi` |
| `codex_local` | `@paperclipai/adapter-codex-local` | Codex CLI | `codex` |
| `gemini_local` | `@paperclipai/adapter-gemini-local` | Gemini CLI | `gemini` |
| `openclaw_gateway` | `@paperclipai/adapter-openclaw-gateway` | (HTTP/Webhook) | — |
| `process` | _(内置)_ | 任意 shell 命令 | — |
| `http` | _(内置)_ | HTTP 端点 | — |

## 2. 核心接口

所有适配器类型定义在 `packages/adapter-utils/src/types.ts`。

### `ServerAdapterModule` — 适配器契约

```typescript
interface ServerAdapterModule {
  type: string;                                    // 例如 "opencode_local", "cursor"
  execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>;
  testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult>;
  sessionCodec?: AdapterSessionCodec;              // 会话参数的序列化/反序列化
  supportsLocalAgentJwt?: boolean;                 // 适配器是否支持 JWT 认证
  models?: AdapterModel[];                         // 静态模型列表
  listModels?: () => Promise<AdapterModel[]>;      // 动态模型发现
  agentConfigurationDoc?: string;                  // 给 UI 的 markdown 配置文档
  listSkills?: (ctx) => Promise<AdapterSkillListResult>;
  syncSkills?: (ctx) => Promise<AdapterSkillListResult>;
  onHireApproved?: (payload, config) => Promise<HireApprovedHookResult>;
}
```

### `AdapterExecutionContext` — 传给 `execute()` 的参数

```typescript
interface AdapterExecutionContext {
  runId: string;                                   // 唯一运行标识
  agent: AdapterAgent;                             // { id, companyId, name, adapterType, adapterConfig }
  runtime: AdapterRuntime;                         // { sessionId, sessionParams, taskKey }
  config: Record<string, unknown>;                 // 适配器配置（model, cwd 等）
  context: Record<string, unknown>;                // 运行时上下文（workspace, task, issue 数据）
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
  onMeta?: (meta: AdapterInvocationMeta) => Promise<void>;
  authToken?: string;                              // 本地 Agent 用于 API 认证的 JWT
}
```

### `AdapterExecutionResult` — `execute()` 的返回值

```typescript
interface AdapterExecutionResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  errorMessage?: string | null;
  usage?: UsageSummary;                            // { inputTokens, outputTokens, cachedInputTokens }
  sessionId?: string | null;                       // 跨心跳恢复会话用
  sessionParams?: Record<string, unknown> | null;
  sessionDisplayId?: string | null;
  provider?: string | null;
  model?: string | null;
  billingType?: "api" | "subscription" | "unknown";
  costUsd?: number | null;
  resultJson?: Record<string, unknown> | null;
  summary?: string | null;
  clearSession?: boolean;                          // 本次运行后是否清除会话
  runtimeServices?: AdapterRuntimeServiceReport[];
}
```

## 3. 架构 — 数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│  Paperclip 服务端 (server/src/services/heartbeat.ts)                │
│                                                                     │
│  1. Heartbeat 循环取出某个 agent 的待处理工作                        │
│  2. 通过 getServerAdapter(agent.adapterType) 解析适配器              │
│  3. 用 agent、config、context 构建 AdapterExecutionContext          │
│  4. 调用 adapter.execute(ctx)                                      │
│  5. 适配器将 CLI 工具作为子进程启动（通过 runChildProcess）         │
│  6. 解析 stdout/stderr → AdapterExecutionResult                     │
│  7. 持久化结果、用量、会话状态、日志                                │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  适配器包（例如 adapter-opencode-local）                              │
│                                                                     │
│  execute.ts:                                                        │
│    - 解析工具命令和 cwd                                              │
│    - 构建环境变量（PAPERCLIP_*）                                     │
│    - 构建 CLI 参数                                                  │
│    - 将 instructions + prompt 写入 stdin                            │
│    - 启动 CLI 进程 → runChildProcess()                              │
│    - 解析 JSONL 输出 → AdapterExecutionResult                       │
│                                                                     │
│  每个适配器有 4 个入口点：                                          │
│    .        → index.ts  （静态配置：type, label, models, doc）       │
│    ./server → execute, testEnvironment, sessionCodec, models 等     │
│    ./ui     → build-config, parse-stdout（转录解析）                 │
│    ./cli    → format-event（CLI 输出格式化）                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  runChildProcess() — packages/adapter-utils/src/server-utils.ts     │
│                                                                     │
│  - 在 PATH（或绝对路径）中解析命令路径                               │
│  - spawn(command, args, { cwd, env, stdio })                        │
│  - 如果有 stdin 则将 prompt 通过管道传入                             │
│  - 处理超时（SIGTERM → SIGKILL）                                    │
│  - 剥离 CLAUDE_CODE_* 嵌套守卫环境变量                               │
│  - 对每个 stdout/stderr 块调用 onLog                                │
│  - 返回 { exitCode, signal, timedOut, stdout, stderr }              │
└─────────────────────────────────────────────────────────────────────┘
```

## 4. OpenCode 的调用方式

**包：** `packages/adapters/opencode-local/`
**入口：** `src/server/execute.ts`

### 关键行为

1. **命令解析**（第 46-60 行）：按以下顺序检查：
   - `config.command`
   - `PAPERCLIP_OPENCODE_COMMAND` 环境变量
   - `~/.opencode/bin/opencode`（本地安装）
   - 回退到 `"opencode"`（假定在 PATH 中）

2. **CLI 参数**（第 339-346 行）：
   ```
   opencode run --format json [--session <id>] [--model <provider/model>] [--variant <variant>] [extraArgs]
   ```

3. **模型发现**（`src/server/models.ts`）：
   - 运行 `opencode models` 列出可用模型（格式 `provider/model`）
   - 结果缓存 60 秒
   - 每次运行前验证配置的模型是否可用

4. **提示词传递**：提示词文本通过管道传入 `opencode run` 进程的 **stdin**。

5. **输出解析**（`src/server/parse.ts`）：
   - 解析 stdout 中的换行分隔 JSON（JSONL）
   - 处理的事件类型：`text`、`reasoning`、`tool_use`、`step_finish`、`error`
   - 提取：sessionId、摘要、用量（token）、成本、错误信息

6. **会话管理**（第 261-273 行）：
   - 使用 `--session <id>` 恢复会话
   - 会话存储时关联 cwd，仅在 cwd 匹配时恢复
   - 如果会话恢复失败（"unknown session"），使用新会话重试

7. **技能注入**（第 113-139 行）：
   - OpenCode 复用 Claude Code 的技能目录：`~/.claude/skills/`
   - Paperclip 将其打包的技能（来自仓库根目录 `skills/`）符号链接到该目录

8. **认证**：当 `supportsLocalAgentJwt: true` 时，服务端生成签名的 JWT 并通过 `PAPERCLIP_API_KEY` 环境变量传递。

9. **注入的环境变量**：
   - `PAPERCLIP_AGENT_ID`、`PAPERCLIP_COMPANY_ID`、`PAPERCLIP_API_URL`
   - `PAPERCLIP_RUN_ID`、`PAPERCLIP_TASK_ID`、`PAPERCLIP_WAKE_REASON`
   - `PAPERCLIP_WORKSPACE_*`（工作空间上下文）
   - `PAPERCLIP_APPROVAL_*`（审批上下文）
   - `PAPERCLIP_LINKED_ISSUE_IDS`
   - `OPENCODE_CONFIG_CONTENT`（用于权限模式）

## 5. Cursor 的调用方式

**包：** `packages/adapters/cursor-local/`
**入口：** `src/server/execute.ts`

### 关键行为

1. **命令解析**（第 159 行）：默认 `"agent"`（Cursor Agent CLI）。

2. **CLI 参数**（第 359-367 行）：
   ```
   agent -p --output-format stream-json --workspace <cwd>
         [--resume <sessionId>] [--model <model>] [--mode plan|ask]
         [--yolo] [extraArgs]
   ```
   - 除非 `--trust`、`--yolo` 或 `-f` 已存在，否则自动添加 `--yolo`
   - `-p` 表示"从 stdin 读提示词"

3. **模型**：默认 `"auto"`。静态回退列表在 `src/index.ts` 中。

4. **计费检测**（第 44-48 行）：
   - 检查环境变量中是否有 `CURSOR_API_KEY` 或 `OPENAI_API_KEY` → `"api"` 计费
   - 否则 → `"subscription"` 计费

5. **输出解析**（`src/server/parse.ts`）：
   - 解析 stdout 中的 JSONL
   - 解析前通过 `normalizeCursorStreamLine()` 规范化行，去除 `stdout:` / `stderr:` 前缀
   - 处理的事件类型：`assistant`、`user`、`thinking`、`tool_call`、`result`、`error`、`system`
   - 提取 sessionId、用量、成本、摘要、错误信息

6. **会话管理**：使用 `--resume <sessionId>` 恢复会话。遇到 unknown session 错误时回退到新会话。

7. **技能**（`src/server/skill-sync.ts`）：
   - Cursor 技能位于 `~/.cursor/skills/`
   - Paperclip 将打包的技能符号链接到该目录，使用 `persistent` 同步模式
   - 清理维护者专属的技能符号链接

8. **提示词构建**（第 343-349 行）：包含 `renderPaperclipEnvNote()`，在提示词中列出可用的 `PAPERCLIP_*` 环境变量。

9. **STDOUT 行缓冲**（第 386-407 行）：Cursor 的 stream-json 输出可能跨 chunk 边界分割，因此适配器缓冲行并实时规范化/发送。

## 6. Claude Code 的调用方式

**包：** `packages/adapters/claude-local/`
**入口：** `src/server/execute.ts`

### 关键行为

1. **命令**：默认 `"claude"`。

2. **CLI 参数**（第 399-413 行）：
   ```
   claude --print - --output-format stream-json --verbose
         [--resume <sessionId>] [--model <model>] [--effort low|medium|high]
         [--dangerously-skip-permissions] [--chrome] [--max-turns N]
         [--append-system-prompt-file <file>] --add-dir <skillsDir>
         [extraArgs]
   ```

3. **提示词传递**：通过 `--print -` 将提示词管道传入 **stdin**。

4. **指令文件**：使用 `--append-system-prompt-file` 注入 agent 指令。将文件内容与路径指令合并写入临时文件。

5. **技能目录**（第 50-66 行）：
   - 创建一个**临时目录**，内含 `~/.claude/skills/`
   - 将打包的技能符号链接到该临时目录
   - 通过 `--add-dir <skillsDir>` 传给 Claude Code
   - 在 `finally` 块中清理临时目录

6. **输出解析**（`src/server/parse.ts`）：
   - 解析 Claude 的 `stream-json` 格式
   - 事件类型：`system/init`、`assistant`、`result`
   - 检测需要登录的错误并提取认证 URL
   - 检测 max_turns 完成
   - 检测未知会话错误以进行重试逻辑

7. **会话管理**：使用 `--resume <sessionId>`。遇到 unknown session 错误时回退。

8. **认证检测**：监控输出中是否出现 "not logged in"、"login required"、"unauthorized" 等模式，返回浏览器登录流程的 URL。

## 7. Pi Local 的调用方式

**包：** `packages/adapters/pi-local/`
**入口：** `src/server/execute.ts`

### 关键行为

1. **命令**：默认 `"pi"`。

2. **CLI 参数**（第 326-345 行）：
   ```
   pi --mode rpc --append-system-prompt <prompt> [--provider <p>] [--model <m>]
      [--thinking <level>] --tools read,bash,edit,write,grep,find,ls
      --session <sessionFile> [extraArgs]
   ```
   - 使用 RPC 模式进行生命周期管理（等待 agent 完成）
   - 使用 `--append-system-prompt` 扩展 Pi 的默认系统提示词
   - 会话文件位于 `~/.pi/paperclips/` 下

3. **RPC stdin**（第 347-354 行）：通过 stdin 发送 JSON 命令：
   ```json
   {"type": "prompt", "message": "<user prompt>"}
   ```

4. **会话文件**（第 89-97 行）：
   - 会话存储为 `~/.pi/paperclips/` 下的 JSONL 文件
   - 文件名格式：`<timestamp>-<agentId>.jsonl`

5. **技能**：注入到 `~/.pi/agent/skills/`，使用 `persistent` 同步模式。

6. **输出解析**：处理 Pi RPC 模式的 JSONL 输出。

## 8. 适配器注册表

**文件：** `server/src/adapters/registry.ts`

所有适配器注册在一个 `Map<string, ServerAdapterModule>` 中：

```typescript
const adaptersByType = new Map([
  claudeLocalAdapter,      // "claude_local"
  codexLocalAdapter,       // "codex_local"
  openCodeLocalAdapter,    // "opencode_local"
  piLocalAdapter,          // "pi_local"
  cursorLocalAdapter,      // "cursor"
  geminiLocalAdapter,      // "gemini_local"
  openclawGatewayAdapter,  // "openclaw_gateway"
  processAdapter,          // "process"（回退）
  httpAdapter,             // "http"
].map(a => [a.type, a]));
```

关键函数：
- `getServerAdapter(type)` — 返回适配器，未知类型回退到 `process` 适配器
- `findServerAdapter(type)` — 返回适配器或 `null`
- `listAdapterModels(type)` — 如果可用则调用 `listModels()`，否则返回静态 `models`
- `listServerAdapters()` — 返回所有已注册的适配器

## 9. 会话管理（Codec）

每个适配器提供 `sessionCodec` 处理会话参数的序列化/反序列化，以便持久化到数据库。

**Codec 接口：**
```typescript
interface AdapterSessionCodec {
  deserialize(raw: unknown): Record<string, unknown> | null;
  serialize(params: Record<string, unknown> | null): Record<string, unknown> | null;
  getDisplayId?: (params) => string | null;
}
```

所有本地适配器（opencode、cursor、claude、pi、codex、gemini）共享几乎相同的 codec 模式，读取：
- `sessionId`（别名：`session_id`、`sessionID`）
- `cwd`（别名：`workdir`、`folder`）
- `workspaceId`、`repoUrl`、`repoRef`

`heartbeat.ts`（第 548-600 行）中的会话状态机决定：
- 如果设置了 `clearSession` → 删除会话
- 如果适配器返回了显式 `sessionParams` → 使用这些参数
- 否则 → 沿用之前的会话参数
- 显示 ID 的解析顺序：显式 `sessionDisplayId` → codec 的 `getDisplayId` → 参数中的 `sessionId` → 之前的会话

## 10. 认证 — 本地 Agent JWT

**文件：** `server/src/agent-auth-jwt.ts`

对于 `supportsLocalAgentJwt: true` 的适配器，Paperclip 生成签名的 JWT（HS256），子进程可以用它来向 Paperclip API 认证。

JWT Claims：
```typescript
{ sub, company_id, adapter_type, run_id, iat, exp, iss, aud }
```

JWT 通过 `PAPERCLIP_API_KEY` 环境变量传递给启动的 CLI 工具。JWT 密钥通过 `PAPERCLIP_AGENT_JWT_SECRET` 配置。

## 11. 技能注入

Paperclip 可以将其**打包的技能**（仓库根目录 `skills/` 中的 markdown 文件）注入到各工具的技能发现路径。

| 适配器 | 技能目录 | 模式 |
|--------|----------|------|
| OpenCode | `~/.claude/skills/` | persistent（与 Claude 共享） |
| Cursor | `~/.cursor/skills/` | persistent |
| Claude Code | 临时目录 + `--add-dir` | ephemeral（运行后清理） |
| Pi | `~/.pi/agent/skills/` | persistent |

**机制**（`packages/adapter-utils/src/server-utils.ts`）：
- `ensurePaperclipSkillSymlink()` — 创建或修复符号链接
- `ensureDesiredSkillsSymlinkedFromPaperclip()` — 批量同步所需技能
- `removeMaintainerOnlySkillSymlinks()` — 清理 `.agents/skills/` 中的过期符号链接
- `listPaperclipSkillEntries()` — 从模块的相对路径发现技能

## 12. UI 和 CLI 层

每个适配器提供两个额外的入口点：

### UI 层（`./ui`）
- `build-config.ts`：将 UI 表单值（`CreateConfigValues`）转换为适配器配置
- `parse-stdout.ts`：将原始 stdout 行解析为 `TranscriptEntry[]`，用于实时运行日志渲染

转录条目类型包括：`assistant`、`thinking`、`tool_call`、`tool_result`、`user`、`init`、`result`、`stderr`、`stdout`、`system`

### CLI 层（`./cli`）
- `format-event.ts`：格式化实时 stdout 事件，用于终端显示

## 13. Process 和 HTTP 回退适配器

### Process 适配器（`server/src/adapters/process/`）
- 通用的 shell 命令执行
- 用作未知适配器类型的默认回退
- **没有**会话感知；不解析 stdout

### HTTP 适配器（`server/src/adapters/http/`）
- 基于 Webhook 的执行
- 调用配置的 URL 端点
- 用于远程/云端 Agent 场景

## 14. 关键设计模式

1. **Heartbeat 驱动执行**：服务端运行一个持续的心跳循环（`server/src/services/heartbeat.ts`），轮询待处理的工作并在每次心跳时调用 `adapter.execute()`。这是主要的执行路径。

2. **JSONL stdout 协议**：三个主要适配器（opencode、cursor、claude）都输出换行分隔的 JSON 事件。Paperclip 解析这些事件用于实时日志显示和结构化结果提取。

3. **会话恢复 + 回退**：适配器尝试恢复会话。如果会话 ID 过期/无效，则回退到新会话。这在 execute 函数中通过重试模式实现。

4. **PAPERCLIP_* 环境变量**：标准化的环境变量，用于向子进程传递 Paperclip 上下文。始终设置：`PAPERCLIP_AGENT_ID`、`PAPERCLIP_COMPANY_ID`、`PAPERCLIP_API_URL`、`PAPERCLIP_RUN_ID`。

5. **社区约定**：每个适配器都是 `@paperclipai/adapter-<name>` 下的独立 npm 包，具有一致的 `server/`、`ui/` 和 `cli/` 子入口点。

## 15. 文件索引

| 文件 | 用途 |
|------|------|
| `packages/adapter-utils/src/types.ts` | 核心适配器接口 |
| `packages/adapter-utils/src/server-utils.ts` | 子进程运行器、技能辅助函数、环境工具 |
| `packages/adapter-utils/src/log-redaction.ts` | 敏感数据的日志脱敏 |
| `server/src/adapters/registry.ts` | 中心适配器注册与查找 |
| `server/src/adapters/types.ts` | 从 adapter-utils 重新导出 |
| `server/src/adapters/utils.ts` | 从 adapter-utils 重新导出，用 logger 包装 runChildProcess |
| `server/src/services/heartbeat.ts` | 驱动适配器执行的心跳循环 |
| `server/src/agent-auth-jwt.ts` | 本地 Agent JWT 生成与验证 |
| `packages/adapters/opencode-local/src/server/execute.ts` | OpenCode 执行逻辑 |
| `packages/adapters/opencode-local/src/server/parse.ts` | OpenCode JSONL 解析器 |
| `packages/adapters/opencode-local/src/server/models.ts` | OpenCode 模型发现 |
| `packages/adapters/opencode-local/src/server/skill-sync.ts` | OpenCode 技能同步 |
| `packages/adapters/cursor-local/src/server/execute.ts` | Cursor 执行逻辑 |
| `packages/adapters/cursor-local/src/server/parse.ts` | Cursor JSONL 解析器 |
| `packages/adapters/cursor-local/src/server/skill-sync.ts` | Cursor 技能同步 |
| `packages/adapters/claude-local/src/server/execute.ts` | Claude Code 执行逻辑 |
| `packages/adapters/claude-local/src/server/parse.ts` | Claude Code JSONL 解析器 |
| `packages/adapters/claude-local/src/server/skill-sync.ts` | Claude Code 技能同步 |
| `packages/adapters/pi-local/src/server/execute.ts` | Pi Local 执行逻辑 |
