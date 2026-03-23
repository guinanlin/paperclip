# Pi Local DTYCLI 对接步骤

**文档类型**：对接操作步骤  
**日期**：2026-03-19  
**前提**：对方已按《Pi Local DTYCLI 接入 Paperclip — 集成建议与改造要求》完成改造，并出具集成就绪通知（参见 pi-local-dtycli 项目内 `doc/paperclip-integration-ready.md`）。

---

## 1. 前置条件

- **Paperclip** 已在本机或目标环境运行（如 `pnpm dev` 后 API 在 `http://localhost:3100`）。
- **pi-local-dtycli** 项目路径已知，例如：`/media/ctyun/datadisk1/exp-projects/pi-local-dtycli`。
- **Node.js** >= 18（与 pi-local-dtycli 要求一致）。
- **Groq API Key**：pi-local-dtycli 当前使用 Groq 模型，需在对方项目 cwd 下配置 `.env.local` 中的 `GROQ_API_KEY`。

---

## 2. 步骤一：构建 pi-local-dtycli CLI

在 pi-local-dtycli 项目根目录执行：

```bash
cd /path/to/pi-local-dtycli
npm run build:cli
```

确认生成 `dist/cli.mjs`，且可执行：

```bash
node dist/cli.mjs --list-models
```

**重要**：Paperclip 的 pi_local 模型解析器当前按「每行至少两个空格分隔 provider 与 model」解析（例如 `groq  llama-3.3-70b-versatile`）。若对方输出为 Tab 或单斜杠（如 `groq/llama-3.3-70b-versatile`），Adapter Test 时可能无法拉取到模型列表。若出现「模型列表为空」，请让对方将 `--list-models` 输出改为每行 `provider  model`（至少两个空格），或与我方确认是否需扩展解析器支持 tab/斜杠。

---

## 3. 步骤二：配置 .env.local（对方 cwd）

pi-local-dtycli 在 RPC 模式下会基于**工作目录**加载 `.env.local`。请在该目录下创建或编辑 `.env.local`，填入 Groq API Key：

```bash
cd /path/to/pi-local-dtycli
echo "GROQ_API_KEY=你的Groq密钥" >> .env.local
```

（或从 <https://console.groq.com/keys> 获取后手动写入。）

---

## 4. 步骤三：在 Paperclip 中创建 Pi (local) Agent

1. 打开 Paperclip 前端（如 `http://localhost:3100`），进入目标公司。
2. 进入 **Agents** → **New Agent**（或已有 Agent 的编辑页）。
3. **Adapter type** 选择 **「Pi (local)」**。
4. 填写配置：
   - **Command**（必填）：指向对方构建产物的可执行命令。建议使用**绝对路径**，例如：
     - `node /media/ctyun/datadisk1/exp-projects/pi-local-dtycli/dist/cli.mjs`
   - **Working directory (cwd)**（推荐）：设为 pi-local-dtycli 项目根目录的绝对路径，例如：
     - `/media/ctyun/datadisk1/exp-projects/pi-local-dtycli`
     这样 RPC 模式下可正确加载该目录下的 `.env.local`。
   - **Model**（必填）：从下拉框选择；若已正确解析 `--list-models`，应出现如 `groq/llama-3.3-70b-versatile`。若下拉为空，请先完成步骤二并确认 `--list-models` 输出格式（见步骤一说明）。
   - 其余选项（Thinking、Bootstrap prompt、Extra args 等）按需填写。
5. 保存 Agent。

---

## 5. 步骤四：执行 Adapter Test

1. 在刚创建/编辑的 Agent 的 **Configuration** 页找到 **Adapter Test** 区域。
2. 点击 **「Test」**（或等价按钮）。
3. 预期结果：
   - 显示「可执行命令」「发现 N 个模型」等通过类信息；
   - 无「命令不可用」「模型列表为空」等错误。
4. 若失败：
   - **命令不可用**：检查 Command 路径是否正确、本机是否已安装 Node、`dist/cli.mjs` 是否已构建。
   - **模型列表为空**：在终端执行 `node /path/to/pi-local-dtycli/dist/cli.mjs --list-models`，确认 stdout 每行为「provider  model」（至少两空格）；必要时请对方调整输出格式或我方扩展解析逻辑。

---

## 6. 步骤五：Run 验证

1. 为该 Agent 触发一次 Run：
   - 方式 A：若配置了 Heartbeat，等待一次触发或在 Paperclip 中手动触发 Heartbeat。
   - 方式 B：为该 Agent 分配一条任务（Issue），由分配/领取逻辑触发 Run。
   - 方式 C：若有「立即运行」或「Test run」入口，可直接使用。
2. 在 Paperclip 的 **Runs**（或 Agent 详情中的 Run 列表）中打开该 Run。
3. 查看 **stdout / stderr**：应能看到 pi-local-dtycli 的回复内容（例如天气查询结果）。若 Run 状态为失败，可根据 stderr 与退出码排查。

**建议首次验证任务**：任务内容可为「杭州天气怎么样」或对方 README 中示例，以确认端到端链路（Paperclip → 调用 pi-local-dtycli RPC → 返回结果 → Paperclip 采集）正常。

---

## 7. 步骤六（可选）：验证 Paperclip 环境变量注入

若后续需要在 Agent 内调用 Paperclip API（如上报状态、拉取任务详情），可确认环境变量是否注入：

- 在 pi-local-dtycli 侧临时增加日志：在 RPC 模式下打印 `process.env.PAPERCLIP_API_URL`、`process.env.PAPERCLIP_RUN_ID` 等（勿打印 `PAPERCLIP_API_KEY`）。
- 触发一次 Run 后，在 Run 的 stdout/stderr 中查看是否出现上述变量值。若存在，则说明 Paperclip 已正确注入，对方可按需使用。

---

## 8. 故障排查速查

| 现象 | 可能原因 | 处理建议 |
|------|----------|----------|
| Adapter Test 报「命令不可执行」 | Command 路径错误或未构建 | 用绝对路径、确认 `npm run build:cli` 已执行、本机可执行 `node dist/cli.mjs` |
| 模型列表为空 | `--list-models` 输出格式与解析器不匹配 | 对方输出改为「provider  model」（至少两空格）；或我方扩展 pi_local 解析器 |
| Run 报 401 / API Key 无效 | `.env.local` 未加载或未在 cwd | 将 Agent 的 cwd 设为 pi-local-dtycli 项目根，并确认该目录下有 `.env.local` 且含 `GROQ_API_KEY` |
| Run 无 stdout | 对方未把回复写入 stdout 或进程异常退出 | 对方确认 RPC 模式下最终回复写入 stdout；查看 stderr 与退出码 |

---

## 9. 参考

- 对方集成就绪说明：`pi-local-dtycli/doc/paperclip-integration-ready.md`
- 我方集成建议与改造要求：`doc/plans/2026-03-18-pi-local-dtycli-integration-recommendation.md`
- Pi Local 适配器技术规格：`doc/plans/2026-03-18-pi-local-agent-frappecli-integration-requirements.md`
