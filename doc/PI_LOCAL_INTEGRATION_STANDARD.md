# Paperclip Pi Local 对接标准

**文档类型**：标准（Standard）  
**版本**：1.0  
**日期**：2026-03-19  
**适用范围**：所有以 **Pi (local)** 适配器身份接入 Paperclip 的外部 CLI / Agent 实现（含基于 pi-mono、自研 CLI 等）。

本文档为 Paperclip 对 Pi Local 对接的**官方标准**。对接方须满足本标准，我方保留在不符合时要求对方改造直至通过验收的权利。

---

## 1. 标准概述

- **标准名称**：Paperclip Pi Local 对接标准。
- **目的**：统一「可被 Paperclip 以 pi_local 方式驱动」的 CLI 接口、配置与行为，保证 Adapter Test、Run 执行与运维可观测一致。
- **效力**：对接方（外部 CLI 实施方、配置方、运维方）须遵循本标准；未满足的，我方有权要求改造并拒绝未通过验收的接入。

---

## 2. 契约标准（必须满足）

以下为 **pi_local CLI 契约**，对接方实现须全部满足。

| 项 | 标准 |
|----|------|
| **命令可执行** | 配置的 `command` 可为单一可执行名（如 `pi`）或「可执行名 + 空格 + 脚本路径」（如 `node /path/to/cli.mjs`）；我方仅校验第一个 token 在 PATH 中可解析，并以此发起子进程。 |
| **模型发现** | 执行 `{command} --list-models` 时，不启动 Agent，仅向 stdout 输出模型列表；每行一条，**provider 与 model 之间至少一个空白**（空格或 Tab），便于我方解析为 `provider/model`；进程退出码 0。 |
| **RPC 模式** | 存在 `--mode rpc` 时，从 **stdin** 读取单行 JSON `{"type":"prompt","message":"<用户提示>"}`，解析 `message` 作为本次用户输入；不得仅从 argv 读取。 |
| **系统提示** | 支持 `--append-system-prompt <string>`，并将其与自身默认 system prompt 合并后传给 LLM。 |
| **模型与思考** | 支持 `--provider`、`--model`（及可选 `--thinking`），与 `--list-models` 输出一致，用于选择 LLM。 |
| **单次 Run 退出** | RPC 模式下完成单次推理后进程退出（0 表示成功）；不常驻等待下一次输入。 |
| **环境变量** | 不硬编码 Paperclip API URL/Key；若调用 Paperclip API，仅使用我方注入的 `PAPERCLIP_*` 环境变量。 |

详细参数、环境变量列表与最佳实践见 **《Pi Local DTYCLI 接入 Paperclip — 集成建议与改造要求》**（`doc/plans/2026-03-18-pi-local-dtycli-integration-recommendation.md`）。

---

## 3. 配置标准（Paperclip 侧）

在 Paperclip 中配置 Pi (local) Agent 时，须满足以下**配置标准**：

| 项 | 标准 |
|----|------|
| **adapterConfig.model** | **必填**。须为 `provider/model` 格式，且为该 Agent 所用 command 的 `--list-models` 输出中的某一项。未配置或格式不符的，Run 将报错并中止。 |
| **adapterConfig.command** | 必填。可执行命令（可含空格，如 `node /path/to/cli.mjs`）。 |
| **adapterConfig.cwd** | 可选。工作目录，建议设为 CLI 项目根或约定 workspace，以便加载 `.env.local` 等配置。 |

配置方须在**保存 Agent 后**再发起 Run；未保存 model 即触发 Run 的，视为不符合配置标准。详见 **《Pi Local 对接方必读：model 为必填项》**（`doc/plans/2026-03-19-pi-local-model-required-requirement.md`）。

---

## 4. 验收与改造权

- **验收**：对接方完成实现后，须通过 Paperclip 的 **Adapter Test**，并至少成功执行一次 **Run**（含 model 配置、stdout/stderr 采集）。
- **改造权**：若对接或运行中出现不符合本标准（含契约标准、配置标准）或我方最佳实践的情形，**我方保留要求对接方按我方约定进行改造的权利**；对接方须按要求修改直至通过验收。具体情形与改造要求见集成建议文档第 5 节。

---

## 5. 引用文档

| 文档 | 说明 |
|------|------|
| `doc/plans/2026-03-18-pi-local-dtycli-integration-recommendation.md` | 集成建议与改造要求（契约细则、最佳实践、改造权情形）。 |
| `doc/plans/2026-03-19-pi-local-model-required-requirement.md` | model 必填要求与配置方式。 |
| `doc/plans/2026-03-19-pi-local-dtycli-onboarding-steps.md` | 对接操作步骤。 |
| `doc/plans/2026-03-18-pi-local-agent-frappecli-integration-requirements.md` | 技术规格（CLI 契约、环境变量、能力要求）。 |
