# OpenClaw Channel 协议调研与 Paperclip 实现机会

**日期**: 2026-03-15  
**作者**: T40 (Full-Stack Engineer)  
**关联**: DTY-27 文档编写

## 1. 目的

研究「本项目是否有机会实现类似 OpenClaw 的 channel 协议」：厘清 OpenClaw 的 channel/gateway 协议是什么，对比 Paperclip 现有实时能力，并给出结论与可选演进路径。

## 2. OpenClaw 的「Channel」指什么

OpenClaw 的实时通信统一走 **Gateway 协议**，基于单条 WebSocket 管道：

- **端点**: `ws://` 或 `wss://`（例如 `ws://localhost:18789/`）
- **消息格式**: JSON-RPC 2.0，三种帧：
  - **Request**: `{ type: "req", id, method, params }`
  - **Response**: `{ type: "res", id, ok, payload | error }`
  - **Event**: `{ type: "event", event, payload }`
- **握手**: Gateway 先发 `connect.challenge`（含 nonce），客户端回 `connect`（带 token、device 签名、role/scopes），服务端回 `hello-ok`（可选 deviceToken）
- **角色**: Operator（控制面 CLI/UI）、Node（能力节点，声明 caps/commands）
- **事件类型**: 如 `agent`、`chat`、`presence`、`health`、`exec.approval.requested/resolved`、设备配对等，向已连接客户端广播

因此「OpenClaw 的 channel 协议」在这里指的是：**单 WebSocket + JSON-RPC 双向请求/响应 + 服务端事件推送** 这一套统一传输与消息形态。

参考：

- [Connecting to the OpenClaw Gateway Protocol](https://open-claw.bot/docs/gateway/protocol/)
- 本仓库 `packages/adapters/openclaw-gateway/README.md`（Paperclip 侧如何用该协议调用 OpenClaw）

## 3. Paperclip 当前与「channel」相关的能力

### 3.1 公司级 WebSocket（最接近「一条 channel」）

- **端点**: `GET /api/companies/:companyId/events/ws`
- **认证**: Board 会话（local_trusted 下无 token）或 Agent API Key（Bearer）
- **语义**: 按公司一条长连接，服务端单向推送事件；客户端只收不发（无 JSON-RPC 请求/响应对）
- **实现**: `server/src/realtime/live-events-ws.ts`、`server/src/services/live-events.ts`
- **UI 使用**: `LiveUpdatesProvider`、`AgentDetail`、`useLiveRunTranscripts` 等订阅该 WS，用于 run 状态、日志、活动等实时更新

**当前已推送的事件类型**（`packages/shared` 中 `LIVE_EVENT_TYPES`）：

- `heartbeat.run.queued`
- `heartbeat.run.status`
- `heartbeat.run.event`
- `heartbeat.run.log`
- `agent.status`
- `activity.logged`
- `plugin.ui.updated`
- `plugin.worker.crashed` / `plugin.worker.restarted`

与 `doc/spec/agent-runs.md` 中 11.3 的设想基本对齐（run 生命周期、agent 状态、activity）；issue/comment 的实时事件可在后续补齐。

### 3.2 插件 Stream Channel（另一套「channel」）

- **用途**: 插件 worker → UI 的实时推送，与公司 WS 正交
- **模型**: 命名 channel，key 为 `(pluginId, channel, companyId)`；worker 侧 `ctx.streams.open/emit/close`，UI 侧 `usePluginStream(channel)`，底层走 SSE `GET /api/plugins/:pluginId/bridge/stream/:channel`
- **文档**: `packages/plugins/sdk/README.md`、`packages/plugins/sdk/src/types.ts`

这是「插件内」的 channel，不是控制面与 agent 之间的通用 channel 协议。

### 3.3 OpenClaw Gateway 在 Paperclip 中的使用方式

`@paperclipai/adapter-openclaw-gateway` 使用 OpenClaw Gateway 协议**调用** OpenClaw（作为 agent 运行时）：

- 建立 WebSocket → 完成 connect 握手 → 发 `req agent`（含 message、idempotencyKey、sessionKey 等）→ 通过 `event agent` 流式收结果
- 不负责「在 Paperclip 内部再实现一套给 UI/其他客户端用的 OpenClaw 风格 channel」；只是协议的使用方。

## 4. 对比与结论

| 维度           | OpenClaw Gateway 协议                     | Paperclip 当前 company WS                    |
|----------------|-------------------------------------------|----------------------------------------------|
| 传输           | 单 WebSocket                              | 单 WebSocket（按公司）                        |
| 方向           | 双向：req/res + 服务端 event              | 单向：仅服务端 → 客户端 event                 |
| 消息形态       | JSON-RPC req/res/event                    | 自定义 `LiveEvent`（id, companyId, type, payload） |
| 认证/握手      | connect.challenge + connect + hello-ok    | Bearer / session，无 challenge 握手          |
| 事件类型       | agent, chat, presence, health, approval 等 | heartbeat.run.*, agent.status, activity, plugin.* |
| 角色/能力声明  | operator / node, scopes, caps             | 无（仅 board / agent 身份）                   |

**结论**：

- **有机会实现「类似」OpenClaw 的 channel 协议**，主要体现在：
  1. **已有「按租户一条长连接 + 服务端推送事件」**：company-scoped WebSocket 已存在且在用，与 OpenClaw 的「单管道推事件」思路一致。
  2. **事件类型可扩展**：可在现有 `LiveEvent` 上增加更多类型（例如 issue.updated、issue.comment.created），与 spec 中的 11.3 一致，无需重造传输层。
  3. **若需要「双向请求/响应」**：可在现有 WS 上增加 JSON-RPC 风格的 req/res（例如 agent 或 UI 主动拉取、下发指令），即向 OpenClaw 的「同一管道既推事件又做 RPC」靠拢；此为可选演进，而非前提。

- **差异保留是合理的**：
  - OpenClaw 面向多端（CLI、UI、多 Node），需要 role/scopes/device 握手与能力声明；Paperclip 当前是控制面 + 少量 agent 端，认证模型不同，不必照搬握手格式。
  - 若未来有「多端、多角色、能力声明」需求，再在现有 WS 上叠一层协议（例如兼容 JSON-RPC 或自定义 req/res）即可。

## 5. 建议的下一步（可选）

- **短期**：保持现有 company WS + `LiveEvent` 形态；补齐 spec 中尚未推送的事件（如 `issue.updated`、`issue.comment.created`），使看板/任务详情实时更新更完整。
- **中期**：若产品需要 UI 或 agent 通过同一连接主动发请求（例如拉取配置、执行轻量指令），再设计在现有 WS 上增加 request/response 语义（可参考 JSON-RPC 或保持简单自定义帧），而不必全盘采用 OpenClaw 的 connect.challenge 与 role 模型。
- **文档**：将本调研与 `doc/spec/agent-runs.md` §11 的 Realtime 设计对齐，便于后续实现时统一术语（company events channel vs 插件 stream channel）。

## 6. 「Channel」的另一含义：IM 接入（企业微信 / 飞书）

评论中提到的需求是：**像 OpenClaw 那样配置 channel 后，在企业微信或飞书的聊天对话框里直接对话**。这里的「channel」指的是 OpenClaw 的 **集成通道**（Feishu、WeCom、Slack 等），而不是上文所述的 Gateway 传输协议。

### 6.1 OpenClaw 在做什么

- OpenClaw 有「通道配置」（channels）：例如飞书、企业微信。管理员在控制台或 `openclaw channels add` 里配置对应平台的 App ID / Secret 等。
- 用户在企业微信/飞书里 @ 机器人或群内发消息 → 平台通过 **长连接（WebSocket）或 webhook** 把事件推给 OpenClaw Gateway → Gateway 把消息交给 Agent，Agent 回复 → 再通过同一通道回写到企业微信/飞书。
- 效果：在 IM 里对话即在与 OpenClaw 对话，无需打开单独 UI。

参考：飞书 [OpenClaw 接入](https://docs.openclaw.ai/zh-CN/channels/feishu)、企业微信接入文档等。

### 6.2 Paperclip 里可以怎么做

Paperclip 的定位是 **控制面**（任务、agent、审批、成本），不是「对话前端」。要在企业微信/飞书里「像 OpenClaw 那样」对话，大致有几条路：

| 方式 | 说明 |
|------|------|
| **A. 用 OpenClaw 当 channel 层** | 企业微信/飞书只接 OpenClaw；OpenClaw 里再配 Paperclip skill，agent 按任务执行、状态回写 Paperclip。用户在企业微信/飞书里聊的是 OpenClaw，任务与执行在 Paperclip 可见。无需 Paperclip 自己实现 IM 协议。 |
| **B. Paperclip 插件实现 IM 桥** | 在 V1 插件体系内写一个插件：订阅某公司的事件或轮询任务，对接企业微信/飞书开放平台（webhook 或长连接）。例如「在飞书说一句话 → 插件创建/更新 issue 或触发某 agent → 结果通过飞书 API 回写」。适合先做 MVP、验证需求。 |
| **C. 产品级「Channel」实体** | 像 OpenClaw 一样在 Paperclip 里有一等公民「Channel」：配置类型（Feishu/WeCom）、凭证、与公司/agent 绑定；入站消息映射为任务或评论，出站由控制面统一发。需要产品与后端设计，超出当前 V1 scope，可作为 roadmap 项。 |

**建议**：

- **短期**：优先说明 **A**——现有就能用：企业微信/飞书接 OpenClaw，OpenClaw agent 接 Paperclip；在 IM 里对话的是 OpenClaw，任务与治理在 Paperclip。
- **若要在 Paperclip 内直接暴露「在 IM 里对话」**：用 **B** 做插件 PoC（例如只支持飞书或企业微信其一），再视需求考虑是否升级为 **C**（一等公民 Channel + 多 IM 支持）。

### 6.3 和「channel 协议」的关系

- **§2–5** 的「channel 协议」= 控制面与客户端之间的 **传输与消息形态**（WebSocket + 事件/RPC）。Paperclip 已有 company WS，可在此之上扩展。
- **本节**的「channel」= **与外部 IM 的集成通道**（企业微信/飞书等）。实现方式是在 Paperclip 侧接 IM 平台 API（或通过 OpenClaw 间接接），与是否采用 OpenClaw 的 Gateway 报文格式无直接关系。

两者可以并存：内部用 company WS 推事件，对外用插件或未来 Channel 实体接 IM。

---

*本文档为 DTY-27「文档编写」任务的交付物。§1–5 回答「是否有机会实现类似 OpenClaw 的 channel 协议」：有机会，且现有 company WebSocket 已提供基础。§6 回应「如何像 OpenClaw 那样配置 channel、在企业微信/飞书里对话」：给出三条路径（用 OpenClaw 当 channel 层 / 插件 IM 桥 / 产品级 Channel）及短期建议。*
