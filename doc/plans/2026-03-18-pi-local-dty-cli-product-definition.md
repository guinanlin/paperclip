# Pi Local DTY CLI — 产品定义规格说明书

**产品名称**：Pi Local DTY CLI（派 Local DTY CLI）  
**文档版本**：1.1  
**日期**：2026-03-18  
**文档类型**：产品定义 / 规格说明书  
**目标读者**：高级工程师、实施与落地负责人

---

## 1. 文档目的与使用说明

本说明书定义产品 **Pi Local DTY CLI** 的边界、交付结果与核心需求，供高级工程师据此实施和落地。阅读本产品定义时，请同步参考技术规格文档 **《Pi Local Agent 接入规格与需求 —— 以 Frappe CLI 为核心能力》**（`doc/plans/2026-03-18-pi-local-agent-frappecli-integration-requirements.md`），该文档给出接入 Paperclip 的 CLI 契约、环境变量、能力要求及最小化构建清单。

---

## 2. 产品概述

### 2.1 产品名称与定位

- **正式产品名称**：**Pi Local DTY CLI**（派 Local DTY CLI）。
- **一句话定位**：基于 Pi 的本地 Agent 运行时，接入 **Paperclip**  Agent 管理平台，并以**友好、可复用**的方式使用 **Frappe CLI（frappecli）**，为 Frappe/ERPNext 场景提供可编排的 Agent 能力。

### 2.2 产品愿景

- 将 **Frappe CLI** 纳入统一的 Agent 编排体系（Paperclip），使 Frappe/ERPNext 的文档、报表、文件、RPC 等操作可通过「分配任务 → Agent 执行 → 回调平台」的闭环完成。
- 通过 **Pi Local** 作为 Agent 运行时，复用 Pi 生态（如 [Pi Mono](https://github.com/badlogic/pi-mono)）的 CLI、工具与扩展能力，并与 **Frappe CLI Skill** 深度结合，降低「教会 Agent 使用 frappecli」的配置成本，提升可维护性与行业最佳实践对齐度。

### 2.3 关键干系人与使用场景


| 角色        | 关注点                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------ |
| **平台运营方** | 在 Paperclip 中注册并管理该 Agent，分配任务、查看 Run、审计行为。                                                      |
| **实施工程师** | 部署 Pi + frappecli 环境，配置 Agent 与 Skill，满足本说明书及技术规格。                                               |
| **业务/产品** | 通过 Paperclip 下发涉及 Frappe/ERPNext 的任务（如「列出某 doctype」「跑某报表」「调用 RPC」），由 Agent 调用 frappecli 执行并回传结果。 |

### 2.4 Frappe CLI 工具说明（Frappe CLI 是干什么的）

**Frappe CLI（frappecli）** 是本产品中 Agent 与 **ERP 环境** 交互的 **CLI 入口**：

- **定位**：一种**命令行工具**，用于与基于 Frappe/ERPNext 的 **ERP 环境** 进行交互。
- **主要能力**：
  - **数据交互**：对 ERP 中的文档（doctype）、报表、文件等进行 CRUD、查询、导出等操作（如 `doc list`、`doc get`、`report run`）。
  - **API 级交互**：通过 REST API 与 ERP 后端通信，支持自定义 RPC 调用、站点管理、多站点切换等。
- **价值**：为 Agent 提供**统一的、可脚本化的 ERP 数据与 API 能力**；Agent 通过调用 frappecli 子命令即可完成「查 ERP 数据、跑报表、调接口」等动作，而无需直接对接 ERP 的 HTTP API。  
- **参考**：[pasogott/frappecli](https://github.com/pasogott/frappecli)、[OpenClaw frappecli SKILL](https://github.com/openclaw/skills/blob/main/skills/pasogott/frappecli/SKILL.md)。

### 2.5 会话与消息管理的边界（最小化理解）

本产品与 **Paperclip** 集成时，采用**最小化 Agent 能力**的定位：

- **本产品侧（Pi Local DTY CLI）**：只需提供 **Agent 能力**——即「可被 Paperclip 按次调用、接收当次任务提示、执行并返回 stdout/stderr」；**不需要**自行实现或维护 Agent 的会话历史、多轮消息、会话存储等。
- **Paperclip 侧**：会话、任务分配、Run 记录、日志与消息的展示与归档均由 **Paperclip Agent 管理平台** 负责；本 Agent 作为平台上的一个「Pi (local)」Adapter 实例，每次 Run 由平台下发当次提示并采集输出即可。
- **实施含义**：最小化实现时，只需确保 Pi 进程支持 Paperclip 的 RPC 调用方式（单次 stdin 输入、stdout/stderr 输出、进程退出）；无需在本产品内再建一套会话或消息管理。若 Pi 或适配器支持可选的 session 恢复（如 `--session`），可作为增强项，非必须。

### 2.6 模型选型（当前考虑）

- **计划采用的模型**：接入https://dashscope.aliyuncs.com/compatible-mode/v1， 使用 **千问（Qwen）** 系列，具体为 **阿里云千问三 Code Plus**（Qwen3 Code Plus）。
- **实施注意**：需在 Pi 的 provider/model 配置中确保 OpenRouter 可用，且 `pi --list-models` 能解析出对应 provider 与 model id；在 Paperclip 中为该 Agent 配置的 `adapterConfig.model` 需与该 provider/model 一致（例如 OpenRouter 下千问三 Code Plus 的 id 格式）。具体 provider 名称与 model id 以 OpenRouter 及 Pi 文档为准。

---

## 3. 交付结果（Deliverables）—— 最重要

本产品交付完成后，必须达到以下**可验收的交付结果**。实施与验收均以本节为准。

### 3.1 交付物清单


| #      | 交付物                                   | 说明                                                                                                                                                                                                                                                                                                                         | 验收方式                                                                                                                                                          |
| ------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **可接入 Paperclip 的 Pi Local Agent 实例** | 在运行 Paperclip Server 的机器（或指定运行机）上，存在一个满足 Paperclip **pi_local** 适配器契约的 Agent 运行时：可执行命令（默认 `pi`）在 PATH 中、`pi --list-models` 返回至少一个 provider/model、支持 RPC 模式与 2.2 节约定的参数与 stdin 行为。                                                                                                                                          | 在 Paperclip 中创建/编辑 Agent，选择 Adapter 类型「Pi (local)」，填写 model/cwd/instructions 等，保存后 **Adapter Test** 通过；且能成功触发至少一次 Heartbeat Run 并采集到 stdout/stderr。           |
| **D2** | **Agent 在 Paperclip 中的注册与配置**         | 在 Paperclip 平台内完成该 Agent 的创建与配置：adapterType = `pi_local`，adapterConfig 含必填项 model 及可选项 cwd、instructionsFilePath、bootstrapPrompt、thinking 等；可选配置 heartbeat、wake-on-demand 等。                                                                                                                                                | 在 Board 上可见该 Agent；其 Configuration 页显示 Pi (local)，Adapter Test 通过；可被分配任务或由 heartbeat 触发。                                                                      |
| **D3** | **Frappe CLI 的可用性与「友好使用」**            | 同一环境中已安装并配置 **frappecli**（如 `~/.config/frappecli/config.yaml` 或等价环境变量）；且 Agent 在运行任务时能够**稳定、可预期**地通过 Pi 的 bash 工具调用 `frappecli` 子命令（如 `doc list`、`report run`、`site doctypes` 等）。                                                                                                                                          | 在 Paperclip 中为该 Agent 分配一条明确涉及 Frappe/ERPNext 操作的任务（如「用 frappecli 列出 User doctype 的前 5 条」）；Run 日志中可见 Pi 调用了 `frappecli` 并返回合理结果；无因「未安装/未配置/Agent 不知道用法」导致的失败。 |
| **D4** | **Frappe CLI Skill 的集成（推荐/最佳实践）**     | 以**可复用、可维护**的方式将 Frappe CLI 的用法注入到 Agent 的上下文中：优先采用 **Frappe CLI Skill**（如基于 [OpenClaw frappecli SKILL](https://github.com/openclaw/skills/blob/main/skills/pasogott/frappecli/SKILL.md) 或等价的 SKILL.md）通过 Paperclip/Pi 的 Skill 机制注入（如 `~/.pi/agent/skills/` 或 instructions 文件），使 Agent 明确知道「何时用 frappecli、如何用」而不依赖临时手写长提示。 | 在不修改任务描述的前提下，Agent 能正确选择并执行 frappecli 子命令；Skill 内容可被版本化、复用；文档中说明 Skill 的放置位置与格式。                                                                              |
| **D5** | **文档与运行指南**                           | 一份面向实施工程师的 **Pi Local DTY CLI 部署与配置指南**，至少包含：环境要求（OS、Node/Python 等）、Pi CLI 与 frappecli 的安装步骤、Paperclip 侧配置步骤、Frappe CLI Skill 的集成方式、常见问题与排查。                                                                                                                                                                               | 一名未参与开发的工程师能仅凭该文档在空白环境完成 D1–D4 的部署与验收。                                                                                                                        |


### 3.2 交付结果小结（一句话）

**交付完成后**：在 Paperclip 中有一个已注册、Adapter Test 通过的 **Pi (local) Agent**，该 Agent 能够稳定、友好地使用 **Frappe CLI** 执行 Frappe/ERPNext 相关任务，且**推荐**通过 **Frappe CLI Skill** 实现「会使用 frappecli」的能力，并配有可交付的部署与配置文档。

---

## 4. 核心需求（必须实现）

以下两项为**硬性、必须满足**的核心需求；交付验收时若任一项不满足，则视为未达标。

### 4.1 核心需求一：接入 Paperclip Agent 管理平台

- **需求描述**：实现一个 **Pi Local Agent**，能够完整接入当前使用的 **Paperclip** Agent 管理平台（[Paperclip](https://github.com/paperclipai/paperclip)）。
- **具体含义**：
  - 该 Agent 在 Paperclip 中以 **Adapter 类型「Pi (local)」**（即 `pi_local`）注册并配置。
  - 满足 Paperclip 对 pi_local 的**全部契约**（参见技术规格文档第 2 节）：可执行命令、`--list-models`、RPC 模式、`--append-system-prompt`、`--provider`/`--model`、`--tools`、`--session`、stdin JSON 提示、环境变量 `PAPERCLIP_`* 等。
  - 平台侧可对该 Agent 进行：创建、编辑、保存配置、执行 Adapter Test、分配任务、触发 Heartbeat、查看 Run 与日志。
- **验收标准**：
  - 在 Paperclip 中创建/编辑 Agent 时能选择「Pi (local)」并保存；Adapter Test 通过。
  - 至少一次通过 Heartbeat 或任务分配触发的 Run 成功完成，且 Paperclip 能采集到该 Run 的 stdout/stderr 与退出状态。

### 4.2 核心需求二：Agent 友好使用 Frappe CLI，并优先集成 Frappe CLI Skill

- **需求描述**：该 Agent 能够**非常友好**地使用 **Frappe CLI（frappecli）**；若能够**更好地集成** Frappe CLI 的 **Skill**，则视为更优实现。
- **「友好使用」的具体含义**：
  - **可用**：在 Agent 运行环境中，frappecli 已安装且位于 PATH 中，Pi 通过 bash（或等价工具）能稳定执行 `frappecli` 子命令。
  - **会用**：Agent 在收到涉及 Frappe/ERPNext 的任务时，能够**主动、正确**地选择并执行 frappecli 的相应子命令（如 `site doctypes`、`doc list`、`report run`、`rpc` 等），而不是依赖用户在一次任务里手写完整命令。
  - **可维护**：推荐通过 **Skill**（结构化、可复用的说明文档，如 SKILL.md）将 frappecli 的安装、配置、命令与示例注入 Agent 上下文；避免仅在 bootstrap 或临时提示中写大段一次性说明。
- **「更好集成 Frappe CLI Skill」的含义**：
  - 采用社区或项目内已有的 **Frappe CLI Skill**（例如 [OpenClaw frappecli SKILL](https://github.com/openclaw/skills/blob/main/skills/pasogott/frappecli/SKILL.md)），或在此基础上整理出符合 Pi/Paperclip 使用习惯的 SKILL.md。
  - 通过 Paperclip/Pi 的 Skill 注入机制（如 `~/.pi/agent/skills/` 或 Paperclip 侧 instructions/skills 目录）将该 Skill 部署到 Agent，使每次 Run 时 Agent 都能加载到 Frappe CLI 的用法说明。
- **验收标准**：
  - 分配至少一条「明确需要操作 Frappe/ERPNext」的任务（如列出某 doctype、跑某报表），Run 成功且日志中可见对 `frappecli` 的调用与合理输出。
  - **推荐**：文档中说明 Frappe CLI Skill 的获取方式、放置位置与格式，并在验收中演示「仅依赖 Skill + 简短任务描述」即可完成上述任务。

---

## 5. 功能需求细化

### 5.1 与 Paperclip 的集成（对应核心需求一）


| 需求 ID | 描述                                                                                                                           | 优先级 |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | --- |
| F1.1  | Agent 可在 Paperclip 中创建，Adapter 类型为 Pi (local)。                                                                               | P0  |
| F1.2  | 支持必填配置项：model（provider/model 格式，来自 `pi --list-models`）。                                                                      | P0  |
| F1.3  | 支持可配置项：cwd、instructionsFilePath、promptTemplate、bootstrapPromptTemplate、thinking、command、extraArgs、env 等（与 pi_local 适配器文档一致）。 | P1  |
| F1.4  | Paperclip 可对该 Agent 执行 Adapter Test（环境检测：Pi 可执行、模型可发现、cwd 有效等）。                                                              | P0  |
| F1.5  | Paperclip 可对该 Agent 触发 Heartbeat 或任务分配，并采集 Run 的 stdout/stderr 与退出状态。                                                        | P0  |
| F1.6  | Agent 运行时可读取 Paperclip 注入的环境变量（如 PAPERCLIP_API_URL、PAPERCLIP_API_KEY），并在需要时调用 Paperclip API（不写死 URL/Key）。                    | P0  |


### 5.2 与 Frappe CLI 的集成（对应核心需求二）


| 需求 ID | 描述                                                                                                              | 优先级 |
| ----- | --------------------------------------------------------------------------------------------------------------- | --- |
| F2.1  | 运行 Agent 的机器上已安装 frappecli，且在 Pi 进程的 PATH 中可执行。                                                                 | P0  |
| F2.2  | frappecli 的配置（站点 URL、API key/secret 等）已就绪，Pi 进程能继承或读取该配置（如 ~/.config/frappecli/config.yaml 或环境变量）。              | P0  |
| F2.3  | Agent 在系统提示或指令中具备「何时、如何用 frappecli」的说明；推荐以 **Frappe CLI Skill**（SKILL.md）形式提供并注入。                               | P0  |
| F2.4  | 给定涉及 Frappe/ERPNext 的自然语言任务，Agent 能解析意图并调用合适的 frappecli 子命令（如 doc list、report run、site doctypes、rpc 等），并返回可读结果。 | P0  |
| F2.5  | （最佳实践）Frappe CLI Skill 的集成方式可文档化、可重复执行（如脚本或文档步骤），便于在新环境或新 Agent 上复用。                                            | P1  |


### 5.3 非功能需求


| 需求 ID | 描述                                                                                                                                                                                | 优先级 |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| NF1   | **安全性**：不在代码或配置中硬编码 Paperclip API URL/Key、Frappe 站点凭证；使用环境变量或 Paperclip/Frappe 官方推荐的配置方式。                                                                                         | P0  |
| NF2   | **可维护性**：Pi 与 frappecli 的安装、版本、配置方式在文档中明确；Skill 与 instructions 的变更可通过版本控制或文档追溯。                                                                                                   | P1  |
| NF3   | **可观测性**：Run 的 stdout/stderr 在 Paperclip 中可查看，便于排查「Agent 是否调用了 frappecli」「frappecli 返回了什么」。                                                                                       | P0  |
| NF4   | **行业最佳实践**：遵循技术规格文档中的契约；若使用 [Pi Mono](https://github.com/badlogic/pi-mono)，保持与上游 CLI 接口兼容；Frappe CLI 的使用方式与 [frappecli 官方文档](https://github.com/pasogott/frappecli) 及社区 Skill 一致。 | P1  |


---

## 6. 验收标准汇总

以下为交付验收时的**最低通过条件**（全部满足方可视为交付完成）。

1. **接入**：在 Paperclip 中存在一个 Adapter 类型为 Pi (local) 的 Agent，其 Adapter Test 通过，且能成功触发至少一次 Run 并采集到完整输出。
2. **Frappe CLI 可用**：该 Agent 在一次或多次 Run 中成功调用了 frappecli（日志可见），并返回了与任务相符的结果。
3. **Skill 集成（推荐）**：文档中说明 Frappe CLI Skill 的集成方式，且验收中演示了基于 Skill 的「友好使用」（无需在单次任务中粘贴大段 frappecli 说明）。
4. **文档**：存在一份面向实施工程师的部署与配置指南，足以支持在空白环境复现 D1–D4。

---

## 7. 实施参考与依赖

- **技术规格**：实施时必须符合 **《Pi Local Agent 接入规格与需求 —— 以 Frappe CLI 为核心能力》**（`doc/plans/2026-03-18-pi-local-agent-frappecli-integration-requirements.md`）中的 CLI 契约、环境变量、能力要求及最小化构建清单。
- **Paperclip 侧**：Pi (local) 已在 Paperclip 中启用（参见 `doc/plans/2026-03-18-pi-local-adapter-enablement-requirements.md`）；无需再改平台代码即可选择 Pi (local) 并配置。
- **外部依赖**：
  - [Pi Mono](https://github.com/badlogic/pi-mono)（或官方 Pi CLI）：提供满足 2.2 节契约的 `pi` 命令。
  - [Frappe CLI（frappecli）](https://github.com/pasogott/frappecli)：提供对 Frappe/ERP 环境的 CLI 入口与数据/API 能力（见 2.4）。
  - [OpenClaw frappecli SKILL](https://github.com/openclaw/skills/blob/main/skills/pasogott/frappecli/SKILL.md)（或等价 SKILL）：推荐作为 Agent 侧「会使用 frappecli」的输入来源。
- **模型（当前考虑）**：OpenRouter + 阿里云千问三 Code Plus（Qwen3 Code Plus）；实施时需在 Pi 中配置对应 provider/model，并使 `pi --list-models` 与 Paperclip 的 model 配置一致。

---

## 8. 术语与缩写


| 术语                         | 含义                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Paperclip**              | 本产品所接入的 Agent 管理平台（控制面），负责公司/Agent/任务/Heartbeat 等编排。                                                      |
| **Pi Local / pi_local**    | Paperclip 的一种 Adapter 类型，表示「在本机以子进程方式运行 Pi CLI」的 Agent。                                                   |
| **Pi Mono**                | [badlogic/pi-mono](https://github.com/badlogic/pi-mono)，Pi 生态的 monorepo，包含 coding agent CLI、统一 LLM API 等。 |
| **Frappe CLI / frappecli** | [pasogott/frappecli](https://github.com/pasogott/frappecli)，与 ERP（Frappe/ERPNext）环境交互的 CLI 入口，提供数据与 API 能力（见 2.4）。 |
| **Frappe CLI Skill**       | 描述 frappecli 安装、配置与用法的结构化文档（如 SKILL.md），供 Agent 加载以「知道何时、如何用 frappecli」。                                  |
| **Adapter Test**           | Paperclip 对 Agent 运行环境的检测（命令可执行、模型可发现、cwd 有效等）。                                                           |
| **Run**                    | Paperclip 对单次 Agent 执行的记录（一次 Heartbeat 或任务分配触发的执行）。                                                       |
| **OpenRouter / 千问三 Code Plus** | 当前考虑的模型选型：通过 OpenRouter 使用阿里云千问（Qwen）系列的千问三 Code Plus；需在 Pi 中配置对应 provider/model（见 2.6）。 |


---

## 9. 修订记录


| 版本  | 日期         | 变更说明                                                                                                                                 |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1.0 | 2026-03-18 | 初版：产品名称 Pi Local DTY CLI，交付结果 D1–D5，核心需求二条，功能与非功能需求，验收标准与实施参考。                                                                           |
| 1.1 | 2026-03-18 | 补充：2.4 Frappe CLI 工具说明（与 ERP 交互的 CLI 入口、数据/API 能力）；2.5 会话与消息管理边界（本产品仅提供 Agent 能力，由 Paperclip 管理会话与消息）；2.6 模型选型（OpenRouter + 千问三 Code Plus）；实施参考中模型与 frappecli 表述更新。 |


