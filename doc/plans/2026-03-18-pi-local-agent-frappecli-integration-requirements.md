# Pi Local Agent 接入规格与需求 —— 以 Frappe CLI 为核心能力

**日期**: 2026-03-18  
**状态**: 需求 / 规格草案  
**目标**: 明确「可接入当前 Paperclip 的 Pi Local Agent」应满足的技术规格与能力要求，并给出以 **Frappe CLI（frappecli）** 为核心、结合 [Pi Mono](https://github.com/badlogic/pi-mono) 等包构建最小化 Agent 的落地要求。

---

## 1. 目标与背景

### 1.1 核心目标

- **业务目标**：让 **Frappe CLI（frappecli）** 通过一个 **Agent** 对外提供能力；即 Agent 在 Paperclip 中注册并接收任务，在执行任务时调用 frappecli 完成对 Frappe/ERPNext 的文档、报表、文件、RPC 等操作。
- **技术路径**：使用 **Pi** 作为本地 Agent 运行时（Pi Local），在 Paperclip 中选用 **pi_local** 适配器；通过 **[Pi Mono](https://github.com/badlogic/pi-mono)**（或你选用的 Pi 生态包）与 **frappecli** 组合，构建一个**最小可用的 Pi Local Agent**，满足 Paperclip 的接入契约并具备「能调 frappecli」的能力。

### 1.2 文档用途

本文档回答：

- 若要接入**当前项目（Paperclip）**，一个「外部的」Pi Local Agent（即本机上的 Pi 进程 + 其环境与配置）需要符合什么样的**技术规格与标准**？
- 该 Agent 需要达到哪些**能力**？
- 若采用「**Pi Mono + frappecli**」的构建方式，**最小化实现**应包含哪些部分、满足哪些条件？

---

## 2. 接入方：Paperclip 对 pi_local 的契约

以下为 Paperclip 服务端在调用 Pi Local Agent 时的行为与假设；你的 Pi Local Agent **必须**在这些约束下可被正确驱动。

### 2.1 运行环境与命令

- **执行主体**：在**运行 Paperclip Server 的同一台机器**上，由 Server 以子进程方式启动一个可执行命令（默认 `pi`，可配置为 `adapterConfig.command`）。
- **PATH**：该命令须在 Server 进程的 PATH 中可解析（或使用绝对路径），且对工作目录、环境变量无特殊依赖（除下文 2.3 约定）。
- **工作目录**：由 Paperclip 传入的 `cwd`（或 workspace 解析结果）必须存在且可写；Pi 进程在该目录下启动，会话、相对路径解析均基于此目录。

### 2.2 CLI 接口要求（Pi 必须支持的调用方式）

Paperclip 会以如下方式调用 Pi（概要）：


| 能力         | 约定                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **模型发现**   | 执行 `pi --list-models`（或等价），能解析出至少一列 `provider\tmodel` 或 `provider/model`；Paperclip 用此列表填充 Model 下拉并校验 `adapterConfig.model`。 |
| **单次运行模式** | 使用 **RPC 模式**：`pi --mode rpc`，以便 Paperclip 通过 stdin 下发单次任务并在进程退出时回收结果。                                                       |
| **系统提示扩展** | 支持 `--append-system-prompt <string>`，将 Agent 指令与 Paperclip 注入的说明追加到 Pi 的系统提示。                                                |
| **模型与思考**  | 支持 `--provider <name> --model <id>`；可选 `--thinking <off                                                                      |
| **工具集**    | 支持 `--tools read,bash,edit,write,grep,find,ls`（或 Pi 当前等价能力），以便 Agent 能读文件、执行 shell（从而调用 frappecli）。                          |
| **会话**     | 支持 `--session <path>`，传入一个会话文件路径；Pi 负责在该路径上持久化/恢复会话（如适用）。                                                                    |
| **用户任务输入** | 通过 **stdin** 接收单行 JSON：`{"type":"prompt","message":"<渲染后的用户提示>"}`。                                                           |
| **输出**     | 通过 **stdout / stderr** 输出；Paperclip 会采集并解析（如 JSONL）用于 Run 日志与状态。                                                             |


你构建的 Pi Local Agent 所使用的 **Pi 实现**（无论是官方 Pi CLI 还是基于 Pi Mono 的封装）必须兼容上述调用方式；若封装了 `pi`，则最终被 Paperclip 调用的命令仍需满足上述接口。

### 2.3 环境变量（Paperclip 注入）

Paperclip 会在启动 Pi 进程时注入以下环境变量（部分可选）；Agent 若需回调 Paperclip API，**必须**使用这些变量而非写死配置：


| 变量                                                                          | 说明                                            |
| --------------------------------------------------------------------------- | --------------------------------------------- |
| `PAPERCLIP_AGENT_ID`                                                        | 当前 Agent ID。                                  |
| `PAPERCLIP_COMPANY_ID`                                                      | 公司 ID。                                        |
| `PAPERCLIP_API_URL`                                                         | Paperclip API 根地址（如 `http://localhost:3100`）。 |
| `PAPERCLIP_API_KEY`                                                         | 本次 Run 的短时 JWT，用于调用 Paperclip API。            |
| `PAPERCLIP_RUN_ID`                                                          | 当前 Run ID。                                    |
| `PAPERCLIP_TASK_ID` / `PAPERCLIP_WAKE_REASON` / `PAPERCLIP_WORKSPACE_CWD` 等 | 按需注入的上下文（任务、唤醒原因、工作区路径等）。                     |


所有对 Paperclip 的 HTTP 调用应使用 `Authorization: Bearer $PAPERCLIP_API_KEY`，Base URL 为 `$PAPERCLIP_API_URL`，路径为 `/api/...`。

### 2.4 指令与提示

- **系统侧**：通过 `--append-system-prompt` 传入的内容包括（由 Paperclip 拼装）：
  - 可选的「Agent instructions」文件内容（由 `adapterConfig.instructionsFilePath` 指定）；
  - 以及 Paperclip 的固定说明（如 Agent 身份、相对路径解析基准等）。
- **用户侧**：每次 Run 的「用户提示」由 Paperclip 根据 `promptTemplate`、bootstrap、session handoff 等渲染后，通过 RPC stdin 的 `message` 字段传入。

你的 Pi Local Agent 只需保证：能正确接收并处理 `--append-system-prompt` 与 RPC 的 `message`，无需关心 Paperclip 内部如何渲染；**若要让 Agent 会使用 frappecli，必须在系统提示或指令中明确写出 frappecli 的用法与适用场景**（见 3.2）。

---

## 3. Pi Local Agent 须具备的能力

### 3.1 必须能力（接入 Paperclip 的底线）


| 能力                   | 说明                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| **满足 2 的 CLI 契约**    | 可被 Paperclip 以 2.1–2.2 的方式启动；`pi --list-models` 可用；支持 RPC + stdin 提示 + 指定 tools/session/provider/model。 |
| **接收并执行任务**          | 能理解 stdin 传入的用户提示，并在单次进程中完成一轮推理与工具调用后正常退出，使 Paperclip 能采集 stdout/stderr。                                |
| **调用 Paperclip API** | 在需要时（如领任务、更新状态、发评论）使用环境变量中的 `PAPERCLIP_API_URL` 与 `PAPERCLIP_API_KEY` 发起 HTTP 请求，且不写死 URL/Key。          |


### 3.2 以 Frappe CLI 为核心的能力（本需求重点）


| 能力                     | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **能执行 frappecli**      | 本机已安装 frappecli，且在 Pi 进程的 PATH 中可访问（即 Pi 通过 **bash** 工具或等价方式能执行 `frappecli ...`）。                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **知道何时、如何用 frappecli** | 通过以下至少一种方式让 Pi 具备「何时用 frappecli、怎么用」的说明： • **Agent instructions 文件**：在 Paperclip 中配置 `instructionsFilePath`，指向一份 Markdown，其中包含 frappecli 的安装、配置、常用命令与示例（可参考 [OpenClaw frappecli SKILL](https://github.com/openclaw/skills/blob/main/skills/pasogott/frappecli/SKILL.md)）； • **Pi Skill**：在 Paperclip 可解析的 skills 目录下增加一目录（如 `frappecli`），内含 `SKILL.md`，内容为 frappecli 用法；Paperclip 会在 Run 前将其注入到 `~/.pi/agent/skills/`，Pi 即可加载； • **Bootstrap / 系统提示**：在 Agent 的 bootstrap 或系统提示中直接写入 frappecli 的简短说明与示例。 |
| **frappecli 运行环境**     | frappecli 所需配置（如 `~/.config/frappecli/config.yaml` 或 `FRAPPE_URL` / `FRAPPE_API_KEY` / `FRAPPE_API_SECRET`）在本机已存在且可用；Pi 进程继承的环境变量或工作目录不影响 frappecli 的读取（或显式在 instructions 中说明如何配置）。                                                                                                                                                                                                                                                                                                                      |


### 3.3 可选能力

- **会话恢复**：若 Pi 支持 `--session` 且 Paperclip 传入会话路径，可实现跨 heartbeat 的会话恢复。
- **Pi Mono 扩展**：[Pi Mono](https://github.com/badlogic/pi-mono) 是 Pi 的 monorepo（coding agent CLI、统一 LLM API、TUI/Web UI、Slack bot、vLLM pods 等）；可作为扩展点封装更多能力；只要最终暴露给 Paperclip 的仍是满足 2.2 的 CLI 接口即可。
- **多 provider/model**：支持在 Paperclip 中为该 Agent 选择不同 model（通过 `pi --list-models` 与 `adapterConfig.model`）。

---

## 4. 最小化构建：Pi + Pi Mono + frappecli

### 4.1 组件角色（建议）


| 组件              | 角色                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Pi CLI**      | 满足 2.2 的「可被 Paperclip 调用」的进程；负责接收提示、调用工具（read/bash/edit/write 等）、与 Paperclip 环境变量对接。                                                      |
| **Pi Mono（可选）** | [pi-mono](https://github.com/badlogic/pi-mono) 提供 coding agent CLI（`@mariozechner/pi-coding-agent`）、统一 LLM API、TUI/Web UI 等包；可作为 Pi 的扩展或封装。**约束**：最终被 Paperclip 启动的仍须是符合 2.2 的 Pi 兼容 CLI（例如 `pi` 或从 pi-mono 构建的 CLI，且对外暴露相同参数与 stdin 行为）。 |
| **frappecli**   | 作为 Pi 通过 **bash** 调用的外部命令，提供 Frappe/ERPNext 的文档、报表、文件、RPC 等能力；Pi 的「知道怎么用」来自 instructions 或 Pi Skill（见 3.2）。                               |


### 4.2 最小实现清单

1. **安装与可执行性**
  - 安装 Pi CLI（如 `npm install -g @mariozechner/pi-coding-agent`），保证 `pi` 在 PATH 中且 `pi --list-models` 可返回至少一个 provider/model。
  - 安装 frappecli（如 `brew install pasogott/tap/frappecli` 或从源码安装），保证在**同一台机器、同一 PATH 环境**下可执行 `frappecli`。
2. **Pi 的认证与模型**
  - 配置至少一个 Pi 可用的 provider（API key 或 Pi 的登录）；在 Paperclip 中创建/编辑 Agent 时，`adapterConfig.model` 选择该 provider 下的一个 model（如 `xai/grok-4`）。
3. **frappecli 的配置**
  - 配置 `~/.config/frappecli/config.yaml`（或等价环境变量），使 frappecli 能连接目标 Frappe/ERPNext 站点；确保 Pi 进程运行时能读到该配置（同一用户、同一 HOME）。
4. **让 Pi「会使用」frappecli**
  - **方式 A**：在 Paperclip 中为该 Agent 设置 **Agent instructions file**（`adapterConfig.instructionsFilePath`），指向一份包含 frappecli 安装、配置、命令与示例的 Markdown（可基于 [OpenClaw frappecli SKILL](https://github.com/openclaw/skills/blob/main/skills/pasogott/frappecli/SKILL.md) 整理）。
  - **方式 B**：在 Paperclip 仓库的 skills 目录下新增目录（如 `skills/frappecli/`），其中放置 `SKILL.md`（内容为 frappecli 用法）；pi_local 适配器会将此类 skill 注入到 `~/.pi/agent/skills/`，Pi 即可在 Run 时加载。
  - **方式 C**：在 Agent 的 **Bootstrap prompt** 中写入 frappecli 的简要说明与 1～2 个示例命令。
5. **Paperclip 侧配置**
  - 在 Paperclip 中创建 Agent，Adapter 类型选择 **Pi (local)**；
  - 必填：`adapterConfig.model`（来自 `pi --list-models`）；
  - 可选：`adapterConfig.cwd`、`instructionsFilePath`、`bootstrapPromptTemplate`、`thinking` 等；
  - 执行 **Adapter Test**，确认「Pi 可执行」「模型可发现」「cwd 有效」。

### 4.3 验收：接入成功

- 在 Paperclip 中为该 Agent 分配任务或通过 heartbeat 触发一次 Run；
- 任务描述中明确涉及 Frappe/ERPNext 操作（如「列出某 doctype」「跑某报表」）；
- Run 日志中能看到 Pi 调用了 `frappecli`（或等价命令）并返回了合理结果；
- 无因「Pi 不满足 2.2」或「frappecli 未安装/未配置/未在指令中说明」导致的失败。

---

## 5. 技术规格小结（可作为检查表）

- **CLI 契约**：本机存在可执行命令（默认 `pi`），支持 `--list-models`、`--mode rpc`、`--append-system-prompt`、`--provider`/`--model`、`--tools`、`--session`，并通过 stdin 接收 JSON 行 `{"type":"prompt","message":"..."}`。
- **环境**：Pi 进程能读取 Paperclip 注入的 `PAPERCLIP_`* 环境变量；需要时使用 `PAPERCLIP_API_KEY` 与 `PAPERCLIP_API_URL` 调用 Paperclip API。
- **frappecli 可用**：同一环境中可执行 `frappecli`，且已配置好站点/API 凭证。
- **frappecli 被「教会」**：通过 instructions 文件、Pi Skill 或 bootstrap 之一，明确写出 frappecli 的用法与适用场景。
- **Paperclip 配置**：Agent 使用 pi_local，model 必填且来自 `pi --list-models`；Adapter Test 通过。

---

## 6. 相关文档与资源

- **Pi Mono**（Pi 生态 monorepo）：[badlogic/pi-mono](https://github.com/badlogic/pi-mono) — coding agent CLI、统一 LLM API、TUI/Web UI、Slack bot、vLLM pods 等。
- Pi Local 适配器配置说明：`packages/adapters/pi-local/src/index.ts`（`agentConfigurationDoc`）。
- Pi 执行与契约：`packages/adapters/pi-local/src/server/execute.ts`。
- Pi Local 启用需求（UI 侧）：`doc/plans/2026-03-18-pi-local-adapter-enablement-requirements.md`。
- frappecli 仓库与用法：[pasogott/frappecli](https://github.com/pasogott/frappecli)；[OpenClaw frappecli SKILL](https://github.com/openclaw/skills/blob/main/skills/pasogott/frappecli/SKILL.md)。
- Paperclip 规范：`doc/SPEC-implementation.md`、`AGENTS.md`。

