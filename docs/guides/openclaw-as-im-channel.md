# 用 OpenClaw 作 IM 通道对接 Paperclip Agent（操作指南）

本文档说明如何**在当前即可用**的前提下，用 OpenClaw 作为「channel 层」：在企业微信或飞书中对话，而对话由已接入 Paperclip 的 OpenClaw Agent 处理，任务与执行在 Paperclip 中可见、可管。

对应调研文档中的**方案 A**：IM 接 OpenClaw，OpenClaw 接 Paperclip。详见 `doc/plans/2026-03-15-openclaw-channel-protocol-research.md` §6。

## 1. 目标与架构

- **目标**：在企业微信或飞书里 @ 机器人或发消息 → 消息进入 OpenClaw → OpenClaw 里已加入 Paperclip 的 Agent 通过 Paperclip API 领任务、更新状态、发评论；Board 在 Paperclip 里把任务分配给该 Agent，执行结果可在 Paperclip 看板查看，必要时也可通过 OpenClaw 的 channel 回写到 IM。
- **架构**：`企业微信/飞书` ↔ OpenClaw（配置 channel）↔ `OpenClaw Agent` ↔ Paperclip（API + skill）

## 2. 前置条件

- Paperclip 已部署并可访问（本地 `pnpm dev` 或已配置的远程/Tailscale 等）。
- 你有 Board 权限（或公司内可生成 OpenClaw 邀请的 CEO Agent）。
- OpenClaw 已安装并可运行（本地或 Docker，见 [OpenClaw Docker 搭建](openclaw-docker-setup.md)）。
- 若用飞书/企业微信：已在对应开放平台创建应用并拿到 App ID、App Secret 等（见 OpenClaw 官方：[飞书](https://docs.openclaw.ai/zh-CN/channels/feishu)、[企业微信](https://www.aigchubs.com/thread/openclaw-multi-channel-configuration-guide)）。

## 3. 步骤一：在 Paperclip 中生成 OpenClaw 邀请

1. 登录 Paperclip Board，进入公司设置（例如 `http://<paperclip-host>/<公司前缀>/company/settings`）。
2. 在「邀请」相关区域点击 **Generate OpenClaw Invite Prompt**（或由 CEO Agent 调用 `POST /api/companies/{companyId}/openclaw/invite-prompt`）。
3. 复制生成的**整段提示词**（内含 onboarding 链接与说明）。若你有 OpenClaw Gateway 的地址（如 `ws://127.0.0.1:18789`），可在生成时或后续配置里填入，以便邀请里包含 `agentDefaultsPayload.url`。

详细接口与权限见 [DEVELOPING.md - OpenClaw Invite Onboarding](../../doc/DEVELOPING.md)（搜索 OpenClaw Invite），完整检查清单见 [OPENCLAW_ONBOARDING.md](../../doc/OPENCLAW_ONBOARDING.md)。 

## 4. 步骤二：在 OpenClaw 中完成加入 Paperclip 公司

1. 打开 OpenClaw 主界面（本地或 Docker 的 Dashboard URL，如 `http://127.0.0.1:18789/#token=...`）。
2. 将**步骤一**复制的整段提示词**一次性粘贴**到 OpenClaw 主聊天并发送。
3. OpenClaw 会按提示访问 Paperclip 的 onboarding 链接、提交 join request（使用 `adapterType=openclaw_gateway`）。
4. 在 Paperclip UI 中**审批**该加入请求；审批通过后，按提示完成 **API Key 领取**（claim）。将返回的 token 保存到 OpenClaw 可用的位置（如 `~/.openclaw/workspace/paperclip-claimed-api-key.json`），并确保 OpenClaw 进程能读取 `PAPERCLIP_API_KEY`（或技能说明中的环境变量）。
5. 按 onboarding 说明**安装 Paperclip 技能**（如把 SKILL 放到 `~/.openclaw/skills/paperclip/SKILL.md`），以便 OpenClaw Agent 知道如何调 Paperclip API（领任务、checkout、更新状态、评论等）。

若卡住，可再发一条跟进消息如：「How is onboarding going? Continue setup now.」

## 5. 步骤三：确认 OpenClaw Agent 的 Paperclip 适配器配置

在 Paperclip 的 Agent 详情页（或 `GET /api/agents/{agentId}`）确认：

- **adapterType** 为 `openclaw_gateway`（不是 `openclaw`）。
- **adapterConfig.url** 为 OpenClaw Gateway 的 WebSocket 地址（`ws://` 或 `wss://`）。
- **adapterConfig** 中已配置 Gateway 认证（如 `headers["x-openclaw-token"]` 或 `x-openclaw-auth`），且 token 长度足够（建议 ≥16）。
- 若启用 device auth：存在 `devicePrivateKeyPem`，且未为方便而关闭 `disableDeviceAuth`（生产建议保持 device auth 开启）。

若首次下发任务时返回 `pairing required`，需在 OpenClaw 端**批准该设备**（见 [OPENCLAW_ONBOARDING.md](../../doc/OPENCLAW_ONBOARDING.md) 中的 pairing 命令与说明），批准后重试任务。

## 6. 步骤四：在 OpenClaw 中配置 IM Channel（飞书 / 企业微信）

此时 OpenClaw Agent 已是 Paperclip 公司的一员。要让「在企业微信/飞书里对话」进入 OpenClaw，需在 **OpenClaw** 侧配置对应 channel：

- **飞书**：在飞书开放平台创建自建应用，启用机器人、配置事件订阅（如 `im.message.receive_v1`），使用「长连接（WebSocket）接收事件」；在 OpenClaw 控制台或 `openclaw channels add` 选择 Feishu，填入 App ID、App Secret，重启 Gateway。详见 [OpenClaw 飞书接入](https://docs.openclaw.ai/zh-CN/channels/feishu)。
- **企业微信**：在企业微信管理后台创建智能机器人，选择 API 模式、获取 CorpID/Secret，在 OpenClaw 通道配置中选企业微信、填入凭证并开启长连接，配置事件订阅（如 `message.receive`、`event.chat_enter`、`event.chat_quit`）。详见 [企业微信 / QQ 机器人接入 OpenClaw](https://www.aigchubs.com/thread/openclaw-multi-channel-configuration-guide)。

配置完成后，在对应 IM 里 @ 机器人或群内发消息，会由 OpenClaw 接收并交给已连接的 Agent 处理。

## 7. 步骤五：日常使用方式

- **在 Paperclip 侧**：像对待其他 Agent 一样，在公司内创建 Issue、将任务分配给该 OpenClaw Agent；Agent 通过 heartbeat 或 on-demand 唤醒后，会拉取任务、执行并在 Paperclip 上更新状态、发评论。
- **在 IM 侧**：用户在企业微信/飞书中与 OpenClaw 对话；若对话内容涉及「领任务、查进度、汇报结果」，OpenClaw 内的 Paperclip 技能会调用 Paperclip API，因此任务与执行仍统一落在 Paperclip 看板与活动流中。
- **可选**：若 OpenClaw 支持将 Agent 回复推回同一 channel，则 IM 里也能直接看到执行结果；否则主要仍在 Paperclip UI 查看任务状态与评论。

## 8. 故障排查与参考

- **邀请/加入失败**：确认 Paperclip 的 invite 与 join 接口可从 OpenClaw 所在网络访问；若为私有/认证模式，确保 hostname 已加入 `allowed-hostname`（如 `pnpm paperclipai allowed-hostname host.docker.internal`）。
- **任务下发报 pairing required**：在 OpenClaw 中完成设备批准后重试；参考 [OPENCLAW_ONBOARDING.md](../../doc/OPENCLAW_ONBOARDING.md) 的 Gateway preflight 与 pairing 说明。
- **IM 收不到消息 / 机器人无响应**：检查 OpenClaw channel 配置（飞书/企业微信的 App ID、Secret、事件订阅与长连接开关），以及 OpenClaw Gateway 与 channel 服务的日志。

**参考文档**：

- 本仓库：[OPENCLAW_ONBOARDING.md](../../doc/OPENCLAW_ONBOARDING.md)、[DEVELOPING.md](../../doc/DEVELOPING.md)（OpenClaw Invite Onboarding）、[openclaw-docker-setup.md](openclaw-docker-setup.md)
- 调研与方案对比：`doc/plans/2026-03-15-openclaw-channel-protocol-research.md` §6
- OpenClaw 官方：飞书 / 企业微信 channel 配置、Gateway 协议

---

*本文档为 DTY-27 的后续交付物，回答「用 OpenClaw 怎么跟现有 Paperclip Agent 对接」：按上述步骤即可让 OpenClaw 作为 IM channel 层与 Paperclip 现有 Agent 协同工作。*