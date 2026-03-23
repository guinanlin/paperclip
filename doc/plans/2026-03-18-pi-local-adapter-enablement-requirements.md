# Pi Local Adapter 启用需求

**日期**: 2026-03-18  
**状态**: 已实现  
**范围**: 在 Paperclip 中正式开放 pi_local 适配器，使用户可在创建/编辑 Agent 时选择「Pi (local)」。

---

## 1. 背景与目的

- **Pi** 是本地 AI 编码 Agent CLI（[Pi Coding Agent](https://www.everydev.ai/tools/pi-coding-agent)，npm: `@mariozechner/pi-coding-agent`），支持多 provider/model（如 `xai/grok-4`）、会话恢复、工具调用（read/bash/edit/write 等）。
- Paperclip 中 **pi_local** 的 Server 与 UI 适配器逻辑已实现（`packages/adapters/pi-local`、`server` registry、`ui` registry），但在 Agent 配置页的 Adapter 下拉框中被标记为 **Coming soon** 且不可选（未纳入 `ENABLED_ADAPTER_TYPES`）。
- **本需求**：将 pi_local 纳入「已启用」适配器，使用户可以选择 Pi (local) 并完成配置与运行，与 Claude/Codex/OpenCode/Cursor 等本地适配器一致。

---

## 2. 产品范围


| 项目        | 说明                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **入口**    | 新建 Agent、编辑 Agent → Adapter type 下拉框                                                                                                               |
| **行为**    | 用户可选择「Pi (local)」，不再显示 Coming soon，可配置 cwd、instructions 文件、model、thinking、bootstrap prompt 等；可执行 Adapter Test、保存并用于 heartbeat/assignment。          |
| **与现有能力** | 与其它 local 适配器一致：需在本机安装 Pi CLI（`npm install -g @mariozechner/pi-coding-agent`），配置 model 为 `provider/model`（通过 `pi --list-models` 获取），支持技能注入与本地 JWT。 |


---

## 3. 功能需求

### 3.1 UI 启用

- Adapter 类型下拉框中 **Pi (local)** 为可选，且**不**显示 “Coming soon”。
- 实现方式：将 `pi_local` 加入前端的 `ENABLED_ADAPTER_TYPES`（或等价白名单），并确保 `adapterLabels` 中存在 `pi_local` 的展示文案（如「Pi (local）」）。

### 3.2 表单与行为一致

- 选择 pi_local 后，展示与其它 local 适配器一致的通用区块：**Working directory**、**Agent instructions file**、**Adapter Test**、**Model**、**Thinking**、**Bootstrap prompt**、**Extra args** 等。
- **Model**：必填，格式 `provider/model`；从后端 `listModels`（即 `pi --list-models`）拉取列表；支持按 provider 分组展示（与 opencode_local 类似）。
- **Thinking**：Pi 使用配置字段 `thinking`，可选值：off、minimal、low、medium、high、xhigh；表单中需映射 `thinkingEffort` ↔ `adapterConfig.thinking`。
- **isLocal**：pi_local 应被视为 local 适配器，从而展示 cwd、instructions、adapter test 等区块。

### 3.3 创建/编辑时的默认与重置

- 新建 Agent 并选择 Pi (local) 时，model 初始为空（用户必须从列表选择，与 opencode_local 一致）。
- 在编辑模式下切换为 pi_local 时，overlay 中清空/重置的字段需包含 `thinking`，避免沿用其它适配器的 effort/mode/variant。

### 3.4 非目标（本需求不做）

- 不提供 Pi CLI 的安装引导或文档内嵌（可后续在 doc 或帮助链接中补充）。
- 不改变 Server 端 pi_local 的 execute/test/listModels 逻辑（已满足需求）。

---

## 4. 实现要点（供开发参考）

- `**ui/src/components/AgentConfigForm.tsx`**
  - `ENABLED_ADAPTER_TYPES`：加入 `"pi_local"`。
  - `isLocal`：条件中加入 `adapterType === "pi_local"`。
  - `thinkingEffortKey` / `thinkingEffortOptions` / `currentThinkingEffort`：为 `pi_local` 增加分支，key 为 `"thinking"`，options 为 Pi 的 off/minimal/low/medium/high/xhigh。
  - Model 下拉：`allowDefault`、`required`、`groupByProvider` 对 pi_local 与 opencode_local 一致（必选、按 provider 分组）。
  - 适配器类型切换时的默认值与 overlay 重置：对 `pi_local` 设置 model 为空，并重置 `thinking`。
  - 本地命令 placeholder：adapterType 为 pi_local 时显示 `"pi"`。
- `**ui/src/components/agent-config-primitives.tsx**`
  - `adapterLabels`：增加 `pi_local: "Pi (local)"`（若尚未存在）。

---

## 5. 验收标准

- 新建 Agent 时，Adapter type 下拉框中可选中「Pi (local)」，且无 “Coming soon” 标记。
- 编辑已有 Agent 时，可将 Adapter type 改为「Pi (local)」并保存。
- 选择 Pi (local) 后，表单展示 Working directory、Agent instructions file、Model（必填、来自 `pi --list-models`）、Thinking（off/minimal/low/medium/high/xhigh）、Bootstrap prompt、Extra args 等，且 Adapter Test 可用。
- 保存后 Agent 的 `adapterType` 为 `pi_local`，`adapterConfig` 含 `model`、`thinking` 等；heartbeat 或分配任务时 Server 使用 pi_local 执行逻辑。
- 类型检查、测试与构建通过（`pnpm -r typecheck`、`pnpm test:run`、`pnpm build`）— 建议交前本地执行一次。

---

## 6. 相关文档与资源

- Pi 适配器配置说明：`packages/adapters/pi-local/src/index.ts`（`agentConfigurationDoc`）。
- Pi CLI 安装与模型列表：`pi --list-models`；npm 包 `@mariozechner/pi-coding-agent`。
- 现有启用适配器列表：`AgentConfigForm.tsx` 中 `ENABLED_ADAPTER_TYPES`。
- 规范：`doc/SPEC-implementation.md`、`AGENTS.md`。

