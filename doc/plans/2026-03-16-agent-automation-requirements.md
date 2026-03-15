# Agent 自动化需求与规划

**日期**: 2026-03-16  
**状态**: 需求草案  
**入口**: Agent 详情页 → Configuration 之后的 **Automation** 标签

## 1. 目的

在 Agent 详情页增加「自动化」能力，让操作者可以为单个 Agent 配置自动化规则，减少重复操作、提高执行一致性。本文档描述首期与后续设想，作为实现的需求输入。

## 2. 产品定位

- **入口**：`/{companyPrefix}/agents/{agentRef}/automation`
- **范围**：按 Agent 维度配置；所有自动化均仅作用于当前 Agent 所在公司、且仅影响当前 Agent 或与其相关的实体（如分配给该 Agent 的 Issue）。
- **与现有能力的关系**：
  - **Configuration**：定义 Agent 是谁、怎么跑（adapter、heartbeat、权限等）。
  - **Automation**：定义「在什么条件下、自动执行什么动作」，是对 Configuration 的补充，不替代 heartbeat/assignment 等既有机制。

## 3. 首期：指令集（Command Set）

### 3.1 概念

- **指令集**：一组**预设的、固定文案的指令**，每一条指令对应一个「标题 + 描述/正文」的模板。
- **用法**：操作者在 Automation 页配置好若干条指令后，在界面上**一键执行**某条指令；系统则：
  1. 根据该指令的模板**创建一条 Issue**（标题与描述来自模板）；
  2. 将该 Issue **分配给当前 Agent**；
  3. （可选）视产品策略决定是否自动将 Issue 设为某状态（如 `backlog` / `open`）。

即：**固定指令 → 一点 → 自动建单并分配给当前 Agent**。

### 3.2 功能需求（首期可实现的子集）


| 项目     | 说明                                                                   |
| ------ | -------------------------------------------------------------------- |
| 指令的增删改 | 在 Automation 页管理「指令集」列表：添加、编辑、删除单条指令。                                |
| 单条指令内容 | 至少包含：**标题**（必填）、**描述/正文**（可选，支持多行或 Markdown）。                        |
| 执行入口   | 在 Automation 页每条指令提供「执行」或「创建 Issue」按钮；点击后调用后端：创建 Issue + 分配当前 Agent。 |
| 权限与审计  | 仅 Board 可配置与执行；创建 Issue、分配等需记入 activity log，符合现有控制面规范。               |
| 数据范围   | 指令集按 Agent 存储；创建的 Issue 属于当前 Agent 所在公司，分配对象固定为当前 Agent。             |


### 3.3 非目标（首期不做）

- 指令内容里**不支持**变量/占位符（如「给 {{project}} 写周报」）；首期仅为固定文案。
- **不**根据事件或时间自动触发（无 cron、无 webhook、无「当 Issue 关闭时」等）；仅支持「用户手动点击执行」。
- 不涉及跨 Agent、跨公司的指令共享或模板市场。

### 3.4 实现要点（供开发参考）

- **存储**：需在 `packages/db` 中为「Agent 级指令集」建模（例如每 Agent 多条记录：agentId、title、body、sortOrder 等），并做 company 校验（通过 agent 归属 company 间接保证）。
- **API**：在 `server` 提供 CRUD 与「执行指令」接口；执行 = 创建 Issue + 调用现有分配逻辑，并写 activity。
- **UI**：Automation 标签页已有占位；首期在该页增加「指令集」区块：列表 + 新增/编辑表单 + 每条的「创建 Issue 并分配」按钮。

## 4. 后续扩展设想（非承诺）

以下为可能方向，**不作为当前实现范围**，仅用于说明「自动化」模块的定位和演进空间：

1. **指令模板变量**
  支持在标题/描述中使用占位符（如项目名、日期），执行时由 UI 或 API 传入参数再创建 Issue。
2. **触发方式扩展**
  - 定时：如「每周一 9:00 自动创建周报 Issue 并分配给该 Agent」；  
  - 事件驱动：如「当某 Project 下新增 Issue 时，自动复制一份给该 Agent」；  
  - 外部触发：如 Webhook、Slack 命令等。
3. **多步骤与审批**
  一条「自动化」可能包含多步（创建 Issue → 改状态 → 发评论），或需经 Board 审批后再执行。
4. **更多自动化类型**
  除「指令集」外，未来可增加其他类型（如「自动重试失败 Run」「达到预算阈值时自动暂停」等），在 Automation 页以多 Tab 或多区块呈现。

以上每一项都需单独评审与排期，本文档仅作需求与思路记录。

## 5. 验收标准（首期）

- Agent 详情页在 Configuration 与 Runs 之间展示 **Automation** 标签，路由为 `…/automation`。
- Automation 页内可管理「指令集」：添加、编辑、删除指令（标题必填，描述可选）。
- 每条指令提供「创建 Issue 并分配给当前 Agent」的执行入口；执行后 Issue 正确创建、归属公司、分配给该 Agent，并有 activity 记录。
- 仅 Board 可访问与操作；行为符合 `doc/SPEC-implementation.md` 与 `AGENTS.md` 中的权限与审计要求。

## 6. 相关文档

- `doc/SPEC-implementation.md` — V1 实现契约与数据范围  
- `AGENTS.md` — 工程规则与 API/权限约定  
- `doc/DATABASE.md` —  schema 与迁移流程

