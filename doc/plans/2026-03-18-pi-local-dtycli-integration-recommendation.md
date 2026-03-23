# Pi Local DTYCLI 接入 Paperclip — 集成建议与改造要求

**文档类型**：集成建议 / 改造要求（细则依 **Paperclip Pi Local 对接标准**）  
**标准文档**：`doc/PI_LOCAL_INTEGRATION_STANDARD.md`  
**日期**：2026-03-18  
**目标读者**：pi-local-dtycli（或 pi-mono-dty）项目的实施方 / 维护方  
**目的**：为使基于 [pi-mono](https://github.com/badlogic/pi-mono) 的 Agent 应用能够作为 **Paperclip pi_local 适配器** 接入我们的 Agent 管理平台，请按**我方对接标准**及本建议对 CLI 接口与运行方式做改造，并遵循下述最佳实践。

---

## 1. 目标与背景

- **我方平台**：[Paperclip](https://github.com/paperclipai/paperclip) — Agent 管理平台（控制面），负责公司/Agent/任务/Heartbeat 的编排与 Run 采集。
- **pi_local 适配器**：Paperclip 通过「在本机执行一条可配置命令」的方式驱动 Agent；该命令须满足我们定义的 **pi_local CLI 契约**（见下）。
- **贵方项目**：基于 pi-mono 的 Agent 应用（如 pi-local-dtycli），当前通过 **命令行参数** 传入用户输入，并通过 Next.js API / 独立 CLI 使用。
- **集成目标**：改造后，我方可将贵方构建出的可执行命令（如 `node dist/cli.mjs`）配置为 Paperclip 中「Pi (local)」Adapter 的 `command`，实现：在 Paperclip 中创建 Agent → 分配任务或 Heartbeat → 我方调用贵方命令并传入当次任务内容 → 贵方执行后退出 → 我方采集 stdout/stderr 完成一次 Run。

请按本建议完成改造，并遵循「必须满足」与「最佳实践」两部分要求。

---

## 2. 必须满足的 CLI 契约

以下为 Paperclip 调用贵方命令时的约定；**必须**全部满足，否则无法作为 pi_local 适配器使用。

### 2.1 模型发现：`--list-models`

- **我方行为**：会执行 `{command} --list-models`（例如 `node dist/cli.mjs --list-models`），不传 stdin。
- **贵方要求**：
  - 当且仅当命令行参数包含 `--list-models` 时，**不启动 Agent**，仅向 **stdout** 输出当前支持的模型列表。
  - 输出格式：每行一个模型，格式为 `provider\tmodel` 或 `provider/model`（Tab 或斜杠分隔），例如：
    - `groq\tllama-3.3-70b-versatile`
    - 或 `openrouter/qwen/qwen3-code-plus`
  - 输出后进程以 0 退出。我方会解析该输出以填充 Paperclip 前端的 Model 下拉框，并校验 Agent 配置中的 `adapterConfig.model` 是否在列表中。

### 2.2 单次 Run：RPC 模式与 stdin 输入

- **我方行为**：会执行贵方命令并传入类似如下的参数（具体以我方适配器实现为准）：
  - `--mode rpc`
  - `--append-system-prompt "<长字符串>"`（包含 Agent 指令、Paperclip 说明等）
  - `--provider <name>`、`--model <id>`（可选 `--thinking`）
  - `--tools <逗号分隔的工具列表>`（如 `read,bash,edit,write,grep,find,ls`，贵方可按能力支持子集）
  - `--session <文件路径>`（可选，用于会话持久化）
- 同时，我方会向进程的 **stdin** 写入**恰好一行** JSON（UTF-8），然后关闭 stdin：
  - `{"type":"prompt","message":"<本次任务/用户提示内容>"}\n`
- **贵方要求**：
  - 当参数包含 `--mode rpc` 时：
    1. 从 **stdin** 读取一行，解析为 JSON，取出 `message` 字段作为本次用户提示；**不要**从 `process.argv` 或位置参数读取用户输入。
    2. 若存在 `--append-system-prompt`，将其内容与贵方默认 system prompt 合并后作为 Agent 的系统提示。
    3. 若存在 `--provider` / `--model`，用于选择 LLM（贵方内部可映射到 OpenRouter/Groq 等）；若不存在则使用贵方默认。
    4. 执行单次 Agent 推理与工具调用，完成后将结果输出到 **stdout**（及必要时 **stderr**），然后**进程退出**（退出码 0 表示成功）。
  - 我方不要求 stdout 必须是特定格式（如 JSONL），但会完整采集 stdout/stderr 作为 Run 日志；建议 stdout 以人类可读或可解析的文本为主，便于在 Paperclip Run 详情中查看。

### 2.3 工作目录与环境变量

- **我方行为**：启动进程时会设置 **当前工作目录（cwd）** 为我方配置的 `adapterConfig.cwd` 或 workspace 解析结果；并注入一组环境变量（见下）。
- **贵方要求**：
  - 所有相对路径（如 instructions 文件、Skill 路径）均基于**当前工作目录**解析。
  - **不要**在代码中硬编码 Paperclip API 的 URL 或 API Key。若需调用 Paperclip API（如上报状态、拉取任务），**必须**使用我方注入的环境变量（见 2.4）。

### 2.4 环境变量（我方注入，贵方只读使用）

我方会在启动贵方进程时注入以下变量（部分可选）；若贵方需要回调 Paperclip，请**仅**使用这些变量：

| 变量 | 说明 |
|------|------|
| `PAPERCLIP_AGENT_ID` | 当前 Agent ID。 |
| `PAPERCLIP_COMPANY_ID` | 公司 ID。 |
| `PAPERCLIP_API_URL` | Paperclip API 根地址（如 `http://localhost:3100`）。 |
| `PAPERCLIP_API_KEY` | 本次 Run 的短时 JWT，调用 API 时使用 `Authorization: Bearer $PAPERCLIP_API_KEY`。 |
| `PAPERCLIP_RUN_ID` | 当前 Run ID。 |
| `PAPERCLIP_TASK_ID`、`PAPERCLIP_WAKE_REASON`、`PAPERCLIP_WORKSPACE_CWD` 等 | 按需注入的上下文。 |

所有对 Paperclip 的 HTTP 请求：Base URL = `$PAPERCLIP_API_URL`，路径以 `/api/` 开头。

---

## 3. 最佳实践（请遵循）

以下为我方推荐的实现方式，便于长期维护、安全及与平台一致。

### 3.1 配置与密钥

- **模型 / Provider**：支持通过 `--provider`、`--model` 覆盖默认；API Key 等凭证通过**环境变量**或**已存在的配置文件**读取，不在代码或仓库中硬编码。
- **多模型**：若支持 OpenRouter、Groq、千问等多家模型，请在 `--list-models` 中返回所有可用 provider/model，由 Paperclip 用户在创建 Agent 时选择。

### 3.2 会话与消息边界

- **单次 Run 无状态**：每次由 Paperclip 触发的 Run 均为「单次调用、单次提示、单次输出、进程退出」；贵方**不需要**在进程内维护多轮会话或消息历史，会话与 Run 记录由 Paperclip 管理。
- **可选的 `--session`**：若贵方实现会话持久化（如写入 `--session` 指定路径），可作为增强；我方不强制要求，且不依赖会话内容做编排。

### 3.3 系统提示与 Skill

- **`--append-system-prompt`**：必须与贵方默认 system prompt 合并使用，以便我方注入 Agent 身份、Instructions 文件内容、Frappe CLI 用法等；合并后作为完整系统提示传给 LLM。
- **Skill / 能力扩展**：若贵方计划支持 Frappe CLI 等能力，建议通过「Instructions 文件」或「Skill 文档」（如 SKILL.md）注入用法说明，由 Paperclip 侧配置 `instructionsFilePath` 或 Skill 目录；贵方 CLI 只需正确接收并应用 `--append-system-prompt` 即可。

### 3.4 工具集

- 我方会传入 `--tools read,bash,edit,write,grep,find,ls`（或等价）；若贵方基于 pi-agent-core 使用不同工具名或工具集，可做映射或支持子集，但**至少应支持通过 bash 执行外部命令**（如调用 frappecli），以便实现「Agent 友好使用 Frappe CLI」的产品目标。

### 3.5 输出与可观测性

- **stdout / stderr**：我方会完整采集并展示在 Paperclip Run 详情中；建议将「最终回复」与「调试/中间日志」区分（例如最终回复用 stdout，详细日志用 stderr），便于运维排查。
- **退出码**：成功完成请返回 0；异常或 LLM/工具错误请返回非 0，便于我方标记 Run 状态。

---

## 4. 改造清单（供实施方自检）

请按以下清单完成改造与自测，满足后即可在我方平台配置为 Pi (local) Agent。

- [ ] **list-models**：执行 `{command} --list-models` 时，仅向 stdout 输出模型列表（每行 `provider\tmodel` 或 `provider/model`），不启动 Agent，进程退出码 0。
- [ ] **RPC 模式**：存在 `--mode rpc` 时，从 **stdin** 读取一行 JSON，解析 `message` 作为用户提示；不使用 argv 位置参数作为提示。
- [ ] **append-system-prompt**：支持 `--append-system-prompt <string>`，并将其与默认 system prompt 合并后传给 LLM。
- [ ] **provider/model**：支持 `--provider`、`--model`（及可选 `--thinking`），并用于选择模型；与 `--list-models` 输出一致。
- [ ] **工作目录**：相对路径基于进程 cwd 解析；不依赖固定绝对路径（或仅在配置中可覆盖）。
- [ ] **环境变量**：不硬编码 Paperclip API URL/Key；若调用 Paperclip API，仅使用 `PAPERCLIP_*` 环境变量。
- [ ] **单次 Run 退出**：RPC 模式下完成单次推理后进程退出；不保持常驻等待下一次输入。
- [ ] **文档**：在贵方 README 或文档中说明「如何作为 Paperclip pi_local 使用」（例如 command 填 `node /path/to/dist/cli.mjs`、必填 model、可选 cwd/instructions 等）。

---

## 5. 对接方自检结论记录（供我方留档）

以下为对接方（pi-local-dtycli）对我方契约与改造清单的自检结论摘要，我方留档备查。

**自检结论**：契约与自检清单中的点均已覆盖，未发现遗漏。

**已核对且符合契约的部分**：

| 项 | 对接方自检说明 |
|----|----------------|
| **list-models** | 输出 `provider\tmodel`；Paperclip 用 `line.split(/\s+/)` 解析，Tab 视为空白，可正确得到 `groq/llama-3.3-70b-versatile`。 |
| **RPC 模式** | 从 stdin 读一行 JSON，解析 `message`；不依赖 argv。支持 `--append-system-prompt`、`--provider`、`--model`、`--thinking`；RPC 下相对路径与 `.env.local` 按 `process.cwd()` 解析。单次 Run 后进程退出；stdout 仅写最终回复，stderr 写工具调用等。 |
| **Agent 层** | listModels() / isSupportedModel() 与 chat 的 appendSystemPrompt、provider、model、thinkingLevel 行为正确；仅在至少传了 provider 或 model 时做模型校验，与默认 (groq, llama-3.3-70b-versatile) 一致。 |
| **Paperclip 调用方式** | execute 将 adapterConfig.model 拆成 provider/modelId 后传 `--provider`、`--model`，当前 CLI 已支持。 |

**对接方已做代码增强**：

- **单参数 `--model provider/model`**：当只传 `--model groq/llama-3.3-70b-versatile`（不传 `--provider`）时，CLI 从该值拆出 provider 与 model 再校验与调用，与 Paperclip 分开传 `--provider`/`--model` 的方式兼容。修改位置：`scripts/cli.ts` 解析 `--model` 时，若值含 `/` 则按 provider/model 拆成两项写入 result。

**验证**：`npm run build:cli` 后执行  
`echo '{"type":"prompt","message":"北京天气"}' | node dist/cli.mjs --mode rpc --model groq/llama-3.3-70b-versatile`  
验证通过。

---

## 6. 对接中若遇不合契约或最佳实践 — 我方保留要求对方改造的权利

在对接、联调或后续运行过程中，若出现以下情况，**我方保留要求贵方按我方约定进行改造的权利**；贵方应按我方给出的改造要求完成修改，以便通过 Adapter Test、Run 验证或满足产品与运维要求。

| 情况 | 我方可能提出的改造要求 |
|------|------------------------|
| **Command 无法被识别为可执行** | 若我方平台无法正确解析贵方配置的 command（如 `node /path/to/cli.mjs`），贵方需配合我方约定：例如拆分为「可执行名 + 脚本路径」的传参方式，或提供单一可执行入口（如打包为单一二进制）。 |
| **`--list-models` 输出格式导致我方解析不到模型** | 贵方需将每行输出改为我方可解析的格式（如 `provider` 与 `model` 之间使用**至少一个空白**分隔，且每行仅一条 provider/model；或按我方指定的分隔符与行格式输出）。 |
| **RPC 模式下未从 stdin 读取提示** | 贵方需改为在 `--mode rpc` 时从 stdin 读取单行 JSON `{"type":"prompt","message":"..."}` 并解析 `message`，不得仅从 argv 读取用户输入。 |
| **未支持 `--append-system-prompt` 或未与默认 system prompt 合并** | 贵方需增加对 `--append-system-prompt <string>` 的支持，并将其内容与贵方默认 system prompt 合并后传给 LLM。 |
| **未支持 `--provider` / `--model` 或与 `--list-models` 不一致** | 贵方需保证运行时使用的 provider/model 与 `--list-models` 输出一致，并支持通过 `--provider`、`--model` 覆盖；否则我方无法正确配置 Agent 的 model。 |
| **硬编码 Paperclip API URL / Key** | 贵方需移除硬编码，改为仅从环境变量 `PAPERCLIP_API_URL`、`PAPERCLIP_API_KEY` 等读取；否则无法支持多环境与密钥轮换。 |
| **RPC 模式下进程不退出或输出不符合预期** | 贵方需保证单次 Run 完成后进程退出（退出码 0 表示成功）；主要回复内容应通过 stdout 输出，便于我方采集并展示在 Run 详情中。 |
| **其他违反第 2 节契约或第 3 节最佳实践的行为** | 按具体契约或最佳实践条款要求贵方做对应修改，直至满足 Adapter Test 与 Run 验证要求。 |

贵方完成改造后，请以文档或联调结果告知我方，以便我方再次执行 Adapter Test 与 Run 验证。

### 6.1 Run 报错：`Failed to call a function` / `failed_generation`

- **现象**：Run 失败，stderr 出现 `Failed to call a function. Please adjust your prompt. See 'failed_generation' for more details.`，退出码非 0。
- **来源**：该错误由**贵方 CLI 或底层 LLM/SDK**（如 Groq、pi-mono）产生，**非 Paperclip 服务端**。Paperclip 仅负责调用贵方命令、传入 stdin 提示、采集 stdout/stderr 与退出码。
- **含义**：通常表示模型在**工具调用（tool call）**环节失败，例如：
  - 模型返回的 tool call 格式不符合 SDK 要求（如 JSON 不合法、缺少必填字段），SDK 报 `failed_generation`；
  - 或工具执行时抛错（如天气 API 限流、网络错误），贵方将错误转成上述文案。
- **建议**（贵方实施）：
  1. 在出现 `failed_generation` 时**记录并可选地输出**模型原始回复（或 tool call 片段），便于区分是「格式错误」还是「工具执行错误」。
  2. 检查 `--tools` 与贵方实际支持的工具列表是否一致；若模型调用了未在 `--tools` 中声明的工具，可能触发解析或执行失败。
  3. 在 system prompt 或示例中明确要求模型按贵方规定的 tool call 格式（如 JSON schema）返回，减少格式类失败。
  4. 对瞬时错误（如 API 限流）做重试或友好错误信息，避免直接以「Failed to call a function」退出。
- **我方行为**：Paperclip 会将贵方 stderr 中的该错误原文展示在 Run 详情中，并视退出码非 0 将 Run 标记为 failed；如需更细的排查，需在贵方 CLI 或日志中查看。

---

## 7. 参考文档

以下路径均相对于 Paperclip 仓库根目录；若贵方未克隆该仓库，可由我方提供文档副本或链接。

- **技术规格（我方）**：`doc/plans/2026-03-18-pi-local-agent-frappecli-integration-requirements.md` — 完整 CLI 契约、环境变量、能力要求。
- **产品定义（我方）**：`doc/plans/2026-03-18-pi-local-dty-cli-product-definition.md` — 交付结果、核心需求、模型选型与会话边界。
- **model 必填要求（我方）**：`doc/plans/2026-03-19-pi-local-model-required-requirement.md` — **adapterConfig.model 为必填**；对接方必须在保存 Agent 前选择 Model，否则 Run 会报错并中止。
- **Paperclip 仓库**：<https://github.com/paperclipai/paperclip> — pi_local 适配器实现见 `packages/adapters/pi-local` 与 `server/src/adapters/registry.ts`。

实施过程中若对契约或环境变量有疑问，可参考上述文档或与我方对接。完成改造后，即可在 Paperclip 中创建 Adapter 类型为「Pi (local)」的 Agent，并将 `adapterConfig.command` 指向贵方构建的可执行命令（如 `node /path/to/pi-local-dtycli/dist/cli.mjs`），进行 Adapter Test 与 Run 验证。若对接中出现第 6 节所列情况，我方将要求贵方按约定改造，直至满足验收要求。
