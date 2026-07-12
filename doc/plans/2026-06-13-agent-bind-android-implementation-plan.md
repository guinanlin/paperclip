# Paperclip Agent Bind（Android）实现方案研究

**日期**: 2026-06-13  
**状态**: 研究草案（供评审）  
**目标读者**: Paperclip 产品/后端/前端/客户端同学

---

## 1. 需求与目标

你提出的核心目标可以拆成两件事：

1. 在 Paperclip 的 Agent 详情中新增 `Binds` 能力（先做 Android）。
2. 定义一套服务端与 Android 客户端可对接的绑定与通信协议（扫码配对 + 长连接）。

期望效果是：在某个 Agent（例如 CEO）上生成配对码，Android App 扫码后完成绑定，后续可通过长连接与该 Agent 建立稳定通道。

---

## 2. 参考项目可复用结论（汤圆财税）

基于你提供的参考文档，已确认以下模式成熟可用：

- 配对主流程：`pair/start -> 扫码 -> pair/confirm -> ws`
- 二维码只携带一次性参数（如 `login_id` + `connection_id`）
- App 不“猜测”服务端地址，而是严格按二维码和 `pair/confirm` 响应执行
- 服务端必须保证二维码里的 base URL 可被手机访问（禁止 `localhost/127.0.0.1`）
- WS 心跳、断线重连、token 鉴权、短期配对令牌 + 长期设备凭证的分层是关键

这些设计与 Paperclip 的需求高度一致，可以直接作为协议骨架。

---

## 3. Paperclip 当前能力盘点（与本需求直接相关）

### 3.1 前端 Agent 详情页扩展点清晰

- `ui/src/pages/AgentDetail.tsx` 当前 tabs 固定为：
  - `dashboard`
  - `configuration`
  - `instructions`
  - `skills`
  - `automation`
  - `runs`
- 路由已支持 `agents/:agentId/:tab`，新增 `binds` 属于低风险扩展。

### 3.2 后端已有成熟鉴权能力可复用

- `server/src/middleware/auth.ts` 已支持 Bearer token（`agent_api_keys`）与会话用户。
- `agent_api_keys` 表已有 `key_hash/last_used_at/revoked_at`，可沿用同样模式做“设备 token 哈希存储”。

### 3.3 已有 WebSocket 基础设施但不满足“双向业务通道”

- 现有 `server/src/realtime/live-events-ws.ts` 是公司级事件订阅（服务端推送为主）。
- Android 绑定通道需要“客户端发消息 + 服务端回消息”的业务 WS，建议新建专用 endpoint，而不是强改 live-events 通道。

### 3.4 已有“短期令牌 + 审批/认领”范式可借鉴

- `invites/join_requests` 流程已具备一次性密钥、过期时间、状态机、审计日志能力。
- 可复用同类模式做 `pair_session`（短期）与 `device_token`（长期）。

---

## 4. 建议的总体方案（V1）

## 4.1 设计原则

- **公司隔离优先**：所有 bind 数据必须 company-scoped（符合 `SPEC-implementation`）。
- **Agent 绑定是一等能力**：绑定目标是具体 agent（如 CEO）。
- **扫码只做“配对与鉴权”，不承载业务内容**。
- **先 Android，协议预留 channel 扩展**（后续可加 WeChat）。
- **先跑通，再增强**：V1 先做稳定配对+通道，复杂多端策略后置。

## 4.2 逻辑架构（建议）

1. **Board 侧（Web）**
   - Agent 详情新增 `Binds` tab
   - 生成配对码、查看绑定状态、解绑设备

2. **Pairing 服务（REST）**
   - `pair/start`: 生成一次性配对会话（含二维码内容）
   - `pair/poll`: Web 轮询会话状态（pending/connected/expired）
   - `pair/confirm`: App 扫码后确认并领取设备凭证

3. **Channel WS 服务（Android 专用）**
   - App 用 `device_token` 建立 WS
   - 双向消息（message/ack/reply/ping/pong/error）

4. **消息路由（与 Paperclip 语义对齐）**
   - 建议 V1 采用“issue/comment 驱动”：
     - App 上行消息 -> 归档为 issue comment（或按规则创建 issue）
     - 触发 assignee agent 唤醒执行
     - 结果通过回复事件回推 App

---

## 5. 数据模型建议（V1）

> 命名是建议，可在实现阶段按仓库风格微调。

### 5.1 `agent_channel_connections`

表示“某 Agent 在某 Channel 下的连接配置”。

- `id`
- `company_id`
- `agent_id`
- `channel` (`android`)
- `status` (`active | paused | revoked`)
- `display_name`
- `metadata`
- `created_at/updated_at`

### 5.2 `agent_channel_pair_sessions`

表示一次扫码配对会话（短期令牌）。

- `id`
- `company_id`
- `agent_id`
- `connection_id`
- `login_id`（唯一）
- `status` (`pending | connected | expired | cancelled`)
- `expires_at`
- `confirmed_at`
- `confirmed_device_id`
- `created_by_user_id`
- `created_at/updated_at`

### 5.3 `agent_channel_devices`

表示配对成功的设备（长期关系）。

- `id`
- `company_id`
- `agent_id`
- `connection_id`
- `channel` (`android`)
- `device_id`
- `device_name`
- `device_token_hash`
- `last_seen_at`
- `revoked_at`
- `created_at/updated_at`

### 5.4 `agent_channel_peers`（可选，建议 V1 保留）

记录 App 内终端用户身份映射（便于会话隔离）。

- `id`
- `company_id`
- `device_id`
- `peer_id`
- `peer_label`
- `last_message_at`

---

## 6. API 与 UI 落地建议

## 6.1 前端（Agent Detail）

### 变更点

- `AgentDetailView` 增加 `binds`
- tab bar 增加 `{ value: "binds", label: "Binds" }`
- 新增 `BindsTab` 组件（先 Android 卡片）

### Binds Tab MVP 功能

- 展示“Android 绑定”卡片
- `生成配对码` 按钮
- 展示二维码 + 有效期倒计时 + 当前 `pairingBaseUrl`
- 轮询配对状态（pending -> connected）
- 展示已绑定设备列表 + 解绑

## 6.2 后端 REST（建议路径）

- `POST /api/agents/:agentId/channels/android/pair/start`
- `GET /api/agents/:agentId/channels/android/pair/poll?login_id=...`
- `POST /api/channel/android/pair/confirm`
- `GET /api/agents/:agentId/channels/android/devices`
- `POST /api/agents/:agentId/channels/android/devices/:deviceId/revoke`

鉴权策略：

- `pair/start/poll/devices/revoke`：board 权限
- `pair/confirm`：匿名可调用，但依赖一次性 `login_id + connection_id`

---

## 7. 与现有 Paperclip 运行模型的衔接（重点）

Paperclip 当前核心是 task/comment 控制面，不是纯聊天产品。  
因此建议 Android Channel 的业务语义采用“任务对象承载对话”，而不是独立聊天数据库。

建议规则（V1）：

- 入站 `message(peer_id, text)`：
  - 若存在活跃 issue 会话 -> 追加 comment
  - 否则按模板创建 issue（标题可含 `peer_id`），assignee=绑定 agent
- 写入 comment 后触发 `heartbeat.wakeup(...)`
- agent 产出（issue comment / run summary）通过 channel 事件转发给对应 `peer_id`

这样可保持：

- 审计一致（activity log）
- 公司边界一致
- 任务系统与移动通道不割裂

---

## 8. 安全与运维要求（必须）

1. **Base URL 可达性**
   - 二维码与 wsUrl 严禁 loopback（`localhost/127.0.0.1/0.0.0.0`）
   - 提供明确的 pairing base URL 配置优先级（见下一份协议文档）

2. **凭证分层**
   - `login_id` 短期一次性（建议 5 分钟）
   - `device_token` 长期可撤销
   - DB 仅存 hash，不存明文

3. **撤销与封禁**
   - 设备可单独 revoke
   - revoke 后 WS 应断开并拒绝重连（401/4401）

4. **审计**
   - `pair_started/pair_confirmed/device_revoked/message_inbound/message_outbound` 记录 activity

5. **速率限制**
   - `pair/confirm` 与 `ws` 握手加限流，防撞库与刷接口

---

## 9. 分阶段交付建议

### Phase 1（最小闭环）

- `Binds` tab（仅 Android）
- `pair/start -> pair/confirm -> ws connected`
- 设备列表/解绑

### Phase 2（业务闭环）

- 入站消息落 issue/comment
- 唤醒 agent 执行
- 回包 `reply` 到 App

### Phase 3（增强）

- 多 peer 并发会话治理
- 离线补偿（HTTP fallback + 历史同步）
- 微信等 channel 复用同一抽象

---

## 10. 关键风险与规避

1. **把 channel 做成“平行聊天系统”**
   - 风险：偏离 Paperclip 控制面定位
   - 规避：消息落在 issue/comment 语义下

2. **多实例部署下配对状态丢失**
   - 风险：内存态 session 在多副本不一致
   - 规避：pair session 入库，不依赖单机内存

3. **开发环境手机不可达**
   - 风险：二维码含 loopback 导致“Web 看似正常，手机必失败”
   - 规避：强校验 pairing base URL，可读提示 + 拒绝错误配置

---

## 11. 建议先确认的决策（评审清单）

1. V1 回包语义是否采用“issue/comment 驱动”作为标准路径？
2. `Binds` tab 是否仅在 CEO/管理角色可见，还是所有 agent 可配置？
3. Android 设备是否允许“一设备绑定多 agent”，还是强制一对一？
4. 是否在 V1 同步支持 HTTP `/messages` 作为 WS 降级通道？
5. 是否复用现有 `invites/join_requests` 体系，还是建立独立 channel 表？

---

## 12. 结论

在当前 Paperclip 代码基础上，实现你要的 Android Bind 是可行且改造面可控的：

- 前端：`AgentDetail` 新增 `Binds` tab 是直接扩展。
- 后端：鉴权、审计、WS、一次性令牌范式都已有现成能力可复用。
- 协议：可直接借鉴汤圆财税的成熟链路并做 Paperclip 语义适配。

建议下一步按本文 Phase 1/2 的顺序推进，先交付“扫码绑定 + 长连接可用”，再落“消息与任务系统打通”。

