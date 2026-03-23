# Sub-issue 创建与父 Issue 总结 — 产品需求说明

**日期**: 2026-03-17  
**状态**: 需求草案  
**入口**: Issue 详情页 → Sub-issues 标签

---

## 1. 背景与问题

### 1.1 现状

- Issue 详情页有 **Comments**、**Sub-issues**、**Activity** 等标签。
- **Comments** 标签下：评论输入区有 **Re-open** 勾选项（当 issue 已处于 done/cancelled 时，勾选后提交评论可重开 issue），以及评论、附件等操作。
- **Sub-issues** 标签下：仅展示当前 issue 的子 issue 列表（`parentId === 当前 issue.id`），**无「创建 Sub-issue」入口**；后端已支持 `parentId` 与按 parent 继承 project，但前端未暴露。
- 创建 Sub-issue 的业务诉求：在父任务基础上「演化出另一件具体事」交给他人做，接活的人需要看到**父任务的背景/总结**，而不是空白上下文。

### 1.2 痛点

- 用户无法在 Issue 详情页直接发起「基于当前 issue 的 Sub-issue」。
- 即使将来有创建入口，若 Sub-issue 描述里没有「父任务总结」，接活方缺少上下文（当前在做什么、进展到哪、为何要拆出这个子任务）。

因此需要在 **Sub-issues 页面**提供「New sub issue」入口，并在创建流程中**先对当前 issue 做 summarize**，再将总结作为 Sub-issue 的父任务背景带入新建弹窗。

---

## 2. 产品目标

- 在 **Issue 详情页 → Sub-issues 标签**下，提供 **New sub issue** 按钮（与 Reopen、Close 等操作在逻辑上并列；Reopen/Close 行为保持与现有 Comments 或全局操作一致）。
- 用户点击 **New sub issue** 后：
  1. **先对当前 issue 做 summarize**（总结标题、描述及可选评论，得到一段「父任务背景」文本）。
  2. **弹出「新建 Sub-issue」弹窗**，并将上述总结**预填到 Sub-issue 的描述或专用「父任务背景」区域**，便于用户补充本 Sub-issue 的具体目标后再提交。
- 新建的 Sub-issue 带 `parentId`、继承父 issue 的 project；父任务背景仅用于展示/预填，不自动同步父 issue 后续变更。

---

## 3. 概念与行为约定

### 3.1 入口位置与操作区

- **位置**：Issue 详情页，**Sub-issues** 标签下的内容区。
- **操作**：
  - **Reopen**：当当前 issue 已关闭（status 为 done/cancelled）时，用户可勾选「Re-open」再执行某操作（与 Comments 中「勾选 Re-open 后发评论即重开」一致）。若在 Sub-issues 区也露出 Reopen，行为应与现有规范统一（例如仅在此处展示勾选，实际重开仍通过评论提交或统一的状态更新接口）。
  - **Close**：若产品上存在「关闭当前 issue」的入口，可与 Reopen 并列；具体语义（如改为 done/cancelled）按现有 Issue 状态规范。
  - **New sub issue**：主流程按钮。点击后触发「summarize 当前 issue + 打开新建 Sub-issue 弹窗」。

### 3.2 点击「New sub issue」后的流程

1. **Summarize 当前 issue**
   - **输入**：当前 issue 的 `title`、`description`，以及可选「最近 N 条评论」或活动摘要。
   - **输出**：一段面向「接活的人」的总结文本（父任务背景），包含：在做什么、已完成/当前状态、为何拆出子任务等（具体 prompt 由实现方定）。
   - **实现路径**（二选一或分阶段）：
     - **方案 A**：后端提供 `POST /api/companies/:companyId/issues/:issueId/summarize`（或等价），服务端调用 LLM 生成总结并返回；前端在打开弹窗前先请求该接口，再将返回的文本带入弹窗。
     - **方案 B**：首期不接 LLM，弹窗内提供「从剪贴板插入」按钮，用户先在 Cursor 等环境对对话/issue 执行 summarize（如 `/compress`），复制结果后在此插入；后续再接入方案 A。
   - 若采用方案 A，需考虑：权限（与查看该 issue 一致）、超时、失败时降级（例如弹窗仍打开，父任务背景为空或提示「总结生成失败，可手动粘贴」）。

2. **打开「新建 Sub-issue」弹窗**
   - 弹窗与现有「新建 Issue」一致，但：
     - 传入 `parentId` = 当前 issue.id，`projectId` = 当前 issue.projectId（继承）。
     - 弹窗标题为「New sub issue」或「新建 Sub-issue」。
     - 在描述区域**上方**或**描述框顶部**提供「父任务背景」展示/编辑区：将上一步得到的 summarize 结果预填于此；用户可编辑、粘贴覆盖或清空。
   - 提交时：`createIssue` 请求包含 `parentId`、`projectId`，以及将「父任务背景」与用户填写的「本 Sub-issue 目标」合并后的 `description`（或仅 description，格式为「## 父任务背景\n\n{总结}\n\n## 本 Sub-issue 目标\n\n{用户输入}」）。

3. **Sub-issue 详情页**
   - 已有：父 issue 链接（如 `IssueProperties` 中 `parentId` 的展示）。
   - 无需强制变更；父任务背景已写入该 Sub-issue 的 description，打开即可见。

### 3.3 Reopen / Close 与 New sub issue 的关系

- 用户表述：「我可以 re-open，同时呢，我也可以 create sub issue」。
- **语义**：对已关闭的 issue，用户可选择「重开它」或「不重开、但基于它创建一个新的 Sub-issue」。
- **行为约定**：
  - 点击 **New sub issue** 时，**不强制**先 Re-open 当前 issue；允许在 issue 仍为 done/cancelled 的情况下创建 Sub-issue（常见场景：父任务已结束，总结后拆出后续子任务）。
  - Reopen 勾选与 New sub issue 独立：用户若希望先 re-open 再建子 issue，可先通过 Comments 等现有流程 re-open，再点 New sub issue。

---

## 4. 数据与范围

### 4.1 数据归属与权限

- **公司隔离**：当前 issue、新建 Sub-issue 均在同一 company 下；summarize 接口与新建 Issue 接口均需校验公司与 issue 访问权限。
- **权限**：仅有权查看该 issue 的操作者（Board 或同等权限）可点击 New sub issue 并调用 summarize（若实现方案 A）及创建 Sub-issue。

### 4.2 与现有能力的关系

- **Issue 表**：已有 `parentId`、`projectId`；创建 Sub-issue 即 `createIssue` 时传 `parentId` + 可选 `projectId`，无需改表。
- **新建 Issue 弹窗**：需扩展支持 `parentId` 与「父任务背景」预填（或专用输入区）；`NewIssueDefaults` 需增加 `parentId` 及可选 `parentContext`/`description` 预填。
- **Summarize**：若采用方案 A，需新增后端 summarize 接口及 LLM 调用（模型、key、限流等由实现阶段定）；若采用方案 B，仅前端增加「从剪贴板插入」即可。

---

## 5. 非目标（首期不做或后续迭代）

- 自动同步父 issue 的后续编辑到已有 Sub-issue 的「父任务背景」。
- 在 Cursor/IDE 内直接触发 Paperclip 的 summarize 或创建 Sub-issue（仅通过 Paperclip UI 操作）。
- 对 Sub-issue 列表的排序、筛选、批量操作（首期仅列表 + New sub issue）。

---

## 6. 验收要点（简要）

- 在 Issue 详情页 **Sub-issues** 标签下，存在 **New sub issue** 按钮。
- 点击后：
  - 若采用方案 A：先请求 summarize 接口，成功后将结果预填到新建 Sub-issue 弹窗的父任务背景/描述区，弹窗带 `parentId` 与 project 继承，提交后子 issue 正确落库且描述含父任务总结。
  - 若采用方案 B：弹窗打开，带 `parentId` 与 project 继承，并提供「从剪贴板插入」等入口供用户粘贴总结；提交后子 issue 正确落库。
- Reopen/Close 与现有行为一致，且不阻止在已关闭 issue 下创建 Sub-issue。

---

## 7. 参考

- `doc/TASKS.md` — Sub-issues (Parent/Child)、继承与 auto-close 规则。
- `ui/src/pages/IssueDetail.tsx` — Sub-issues 标签与 `childIssues` 展示。
- `ui/src/context/DialogContext.tsx` — `NewIssueDefaults`、`openNewIssue`；需扩展 `parentId` 与父任务背景。
- 此前讨论：Sub-issue 场景下「先 summarize 父 issue，再把结果作为 Sub-issue 背景」的流程与 Cursor `/compress` / 剪贴板插入的衔接。
