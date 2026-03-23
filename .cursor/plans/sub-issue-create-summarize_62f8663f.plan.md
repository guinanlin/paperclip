---
name: sub-issue-create-summarize
overview: 把「New sub issue」移动到 Comments 的同一操作区（与 Re-open 并列），并在点击后由后端触发一次 Cursor Agent 的 /compress 总结父 issue，上下文结果自动预填到新建 Sub-issue 弹窗。
todos:
  - id: ui-move-entry
    content: 把 New sub issue 入口移动到 Comments 的 CommentThread 操作区，并移除/避免 Sub-issues tab 重复入口
    status: completed
  - id: api-summarize-contract
    content: 新增前端 issuesApi.summarize 调用与 shared API contracts（如需要）
    status: completed
  - id: server-summarize-endpoint
    content: 新增 POST /api/companies/:companyId/issues/:issueId/summarize：触发 Cursor Agent /compress 并返回 summary 文本
    status: completed
  - id: ui-flow-summarize-then-dialog
    content: 实现点击 New sub issue：先 summarize（loading/错误处理），成功后 openNewIssue 预填 parentContext
    status: completed
  - id: verification
    content: 跑 typecheck/tests/build（按 AGENTS.md 的 DoD），并手动验证 UI 路径
    status: completed
isProject: false
---

## 目标

- 在 Issue 详情页的 **Comments** 标签下（`CommentThread` 的操作区），把 **New sub issue** 放到 **Re-open** 勾选框旁边，作为同一“决策点”的另一动作。
- 点击 **New sub issue** 时：
  - 先触发 **summarize（Cursor Agent /compress）**
  - summarize 成功后自动打开 `NewIssueDialog`，并把 summarize 文本写入 `parentContext`（父任务背景）
  - summarize 失败时：仍可打开弹窗，但父任务背景为空并给出明确错误提示（用户可手动粘贴）。

## 现状核对（已在代码中确认）

- 目前入口在 Sub-issues tab：`[ui/src/pages/IssueDetail.tsx](ui/src/pages/IssueDetail.tsx)` 的 `TabsContent value="subissues"` 里有 `New sub issue` 按钮，点击调用 `openNewIssue({ parentId, projectId })`。
- `NewIssueDialog` 已支持 sub-issue 模式：`[ui/src/components/NewIssueDialog.tsx](ui/src/components/NewIssueDialog.tsx)`
  - 当 `newIssueDefaults.parentId` 存在时，展示「父任务背景」字段，并支持“从剪贴板插入”。
  - 提交时会把 `parentContext` 组装进 `description`，并发送 `parentId`。
- `CommentThread` 的操作区（Re-open 勾选框）在 `[ui/src/components/CommentThread.tsx](ui/src/components/CommentThread.tsx)` 的按钮行：`<div className="flex items-center justify-end gap-3"> ... Re-open ... Comment按钮`。

## 设计与数据流

```mermaid
flowchart TD
  UserClick[UserClicksNewSubIssue] --> UiHandler[CommentThreadNewSubIssueHandler]
  UiHandler --> ApiCall[POSTIssuesSummarize]
  ApiCall -->|success(summaryText)| OpenDialog[openNewIssue{parentId,projectId,parentContext}]
  ApiCall -->|failure| OpenDialogFallback[openNewIssue{parentId,projectId,parentContext:""}]
  OpenDialog --> Dialog[NewIssueDialog]
  OpenDialogFallback --> Dialog
```



## 实施步骤

- 前端（入口与交互）
  - 在 `IssueDetail` 的 Comments tab 中，把 `New sub issue` 按钮渲染到 `CommentThread` 操作区旁边。
    - 方式：给 `CommentThread` 增加一个可选的 `extraActions`/`rightActions` slot（ReactNode），由 `IssueDetail` 传入。
    - 同时移除或弱化 Sub-issues tab 顶部的按钮（避免重复入口）。
  - 点击按钮时：
    - 先调用新的 `issuesApi.summarize(issueId)`（见后端接口）
    - loading 期间按钮禁用并显示“Summarizing…”
    - 成功：`openNewIssue({ parentId: issue.id, projectId: issue.projectId, parentContext: summary })`
    - 失败：弹 toast（或在按钮附近提示），仍打开 dialog（`parentContext` 为空）
- 后端（summarize API：触发 Cursor Agent /compress）
  - 在 `[server/src/routes/issues.ts](server/src/routes/issues.ts)` 新增路由（公司隔离）：
    - `POST /api/companies/:companyId/issues/:issueId/summarize`
  - 在 `[server/src/services/issues.ts](server/src/services/issues.ts)` 添加服务方法：
    - 读取 issue（title/description/必要的最近评论或活动，按你需求文档的“上下文”范围）
    - 触发一次“Cursor Agent run /compress”并等待结果（需要复用现有 adapter/execute/heartbeat 机制；具体会先在实现时定位当前系统如何发起 run 并拿到输出文本）
    - 返回 `{ summary: string }`
  - 权限与不变量：
    - 必须校验 companyId 与 issue 归属一致；并复用现有的 board operator 权限逻辑。
    - 该接口是读取+生成，不写 DB（除非你们希望记录 activity；此处默认不记录）。
  - 失败与超时：
    - 设置合理超时（例如 20-60s）
    - 返回一致的错误码（例如 `502/504`）与消息
- contracts 同步
  - 在 `packages/shared` 增加 summarize endpoint 的类型/路径常量（如果仓库对 API path 做了集中管理），并在 UI `issuesApi` 增加对应调用方法。

## 关键文件清单

- UI
  - `[ui/src/pages/IssueDetail.tsx](ui/src/pages/IssueDetail.tsx)`
  - `[ui/src/components/CommentThread.tsx](ui/src/components/CommentThread.tsx)`
  - `[ui/src/api/issues.ts](ui/src/api/issues.ts)`（新增 `summarize`）
  - `[ui/src/components/NewIssueDialog.tsx](ui/src/components/NewIssueDialog.tsx)`（复用 `parentContext`，必要时只做小调整）
- Server
  - `[server/src/routes/issues.ts](server/src/routes/issues.ts)`
  - `[server/src/services/issues.ts](server/src/services/issues.ts)`
  - 可能会复用/扩展：`server/src/routes/llms.ts`、`server/src/services/heartbeat*.ts`、`server/src/adapters/*`（取决于现有“发起 agent run 并提取输出”的实现位置）

## 验收标准

- Comments 标签的操作区里与 Re-open 并列显示 **New sub issue**。
- 点击后：
  - UI 显示 summarize loading
  - summarize 成功自动弹出 `NewIssueDialog`（标题显示 New sub issue）
  - 弹窗「父任务背景」自动填入总结文本
  - 创建后子 issue `parentId` 正确，description 结构包含父任务背景与子任务目标
- summarize 失败：仍可创建 sub-issue，且 UI 给出明确错误提示/降级路径（手动粘贴）。

