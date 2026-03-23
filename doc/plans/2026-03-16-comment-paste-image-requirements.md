# 评论区 Ctrl+V 粘贴图片上传 — 产品需求文档

**日期**: 2026-03-16  
**状态**: 需求草案  
**入口**: Issue 详情页 → Comments 标签 → 评论输入区（CommentThread）

---

## 1. 背景与问题

### 1.1 现状

- 在 Issue 详情页的 **Comments** 标签下，评论输入区提供：
  - **Markdown 编辑器**：输入评论正文，支持 @提及、内联图片上传（通过 `imageUploadHandler` 插入 Markdown 图片链接）。
  - **附件按钮**：回形针图标（Paperclip），点击后弹出文件选择框，仅支持 `image/png, image/jpeg, image/webp, image/gif`，选择后通过 `onAttachImage` 上传为 **Issue 附件**（不写入评论正文）。
- 附件上传目前**仅支持「点击 → 选文件」**一种方式；评论区内无粘贴图片的快捷方式。

### 1.2 痛点

- 用户上传的多数为**截图或复制的图片**（如从截图工具、网页、其他应用复制后），需要先保存成文件再点击回形针选择，步骤多。
- **Ctrl+V（粘贴）** 是常见心智模型：截图/复制后直接粘贴即可上传，无需切到文件选择对话框。
- 与 Slack、飞书、Notion 等产品的「粘贴即上传图片」体验不一致，影响效率。

因此需要在评论输入区增加 **Ctrl+V 粘贴图片并上传** 的快捷方式，与现有「回形针选文件」并存，且行为一致（上传为 Issue 附件或插入评论内联，见下节约定）。

---

## 2. 产品目标

- **在评论输入区内**，当用户按下 **Ctrl+V（Windows/Linux）或 Cmd+V（macOS）** 且剪贴板中为图片时，自动将图片上传，并以与当前产品约定一致的方式呈现（见 3.2）。
- 不改变现有「回形针选文件」的交互与能力；粘贴仅作为**额外的快捷入口**。
- 非图片的粘贴（纯文本、HTML 等）保持浏览器默认行为，不拦截。

---

## 3. 概念与行为约定

### 3.1 触发区域（焦点/上下文）

- **建议触发范围**：当焦点处于以下任一位置时，粘贴视为「评论区粘贴」：
  - 评论 **Markdown 编辑器**内（即 `CommentThread` 内的 `MarkdownEditor`）；
  - 评论区底部操作栏（含回形针、Re-open 勾选、Assignee、Comment 按钮）获得焦点时（若技术上可区分焦点）。
- 为简化实现，**最小可行范围**可仅限：**焦点在评论 Markdown 编辑器内**时，监听 paste 事件并处理图片。

### 3.2 粘贴结果：附件 vs 内联

当前评论区存在两种「图片上传」语义：


| 方式          | 回调                         | 结果                                |
| ----------- | -------------------------- | --------------------------------- |
| 回形针按钮       | `onAttachImage(file)`      | 上传为 **Issue 附件**，不入评论正文           |
| 编辑器内拖拽/选择图片 | `imageUploadHandler(file)` | 上传后得到 URL，**插入评论正文**为 Markdown 图片 |


**建议**（需产品确认）：

- **方案 A（推荐）**：Ctrl+V 粘贴的图片与「回形针」行为一致，即 **上传为 Issue 附件**（调用 `onAttachImage`），不入评论正文。理由：用户表述为「上传附件」「把图片给上传上去」，与附件语义一致；且避免误把大图塞进正文。
- **方案 B**：粘贴的图片与编辑器内上传一致，即 **插入评论正文**（通过 `imageUploadHandler` 得到 URL 并插入当前光标处）。适合「写评论时顺带贴图」的场景。
- **方案 C**：支持在 UI 上区分（例如：在编辑器中粘贴 = 内联，在操作栏焦点时粘贴 = 附件），首期实现成本较高，可作后续增强。

文档默认采用 **方案 A**，若选择 B 或 C 请在实现前更新本文档。

### 3.3 支持的图片类型

与现有附件一致：**image/png, image/jpeg, image/webp, image/gif**。  
剪贴板中若为其他 MIME（如 `image/svg+xml`），可按产品决定：要么仍上传（若后端支持），要么忽略粘贴内容并保持默认粘贴行为。

### 3.4 多图与命名

- 一次粘贴通常只含**一张**剪贴板图片；若系统剪贴板 API 能拿到多张，可约定首期只处理第一张，或按产品要求支持多张依次上传。
- 粘贴产生的文件可无原始文件名（如截图），后端/前端可生成默认名（如 `pasted-image.png`），与现有附件命名策略一致即可。

---

## 4. 功能需求

### 4.1 核心流程

1. 用户在评论输入区（见 3.1）按下 **Ctrl+V / Cmd+V**。
2. 前端监听 `paste` 事件，读取 `event.clipboardData`。
3. 若存在 `clipboardData.files` 且包含至少一个图片类型文件（MIME 符合 3.3）：
  - 阻止默认粘贴行为（避免将图片以 base64 等形式插入编辑器）。
  - 取第一张（或多张，见 3.4）图片，调用现有上传逻辑：
    - **方案 A**：调用 `onAttachImage(file)`（与回形针一致）；
    - **方案 B**：调用 `imageUploadHandler(file)` 并将返回的 URL 插入编辑器光标处。
4. 上传过程中展示与回形针一致的 **loading 状态**（如 `attaching` 或「Uploading...」），防止重复提交。
5. 上传成功：若为方案 A，附件列表刷新并展示新附件；若为方案 B，评论正文中插入 Markdown 图片。失败时给出与现有上传一致的错误提示。

### 4.2 非图片粘贴

- 若 `clipboardData` 中无图片文件（仅文本/HTML 等），**不拦截**，由浏览器/编辑器默认处理（如粘贴文本）。
- 若仅有非图片类型文件，建议同样不拦截，保持默认行为。

### 4.3 无障碍与提示

- 若有「Attach image」的 tooltip/说明，可补充文案如：「支持 Ctrl+V 粘贴图片」。
- 粘贴上传时的 loading 与错误状态需对屏幕阅读器友好（与现有按钮上传一致）。

---

## 5. 技术范围与实现要点

### 5.1 涉及模块

- `**ui/src/components/CommentThread.tsx`**  
  - 当前：`MarkdownEditor` + 底部操作栏（含 `attachInputRef` 与回形针按钮）、`onAttachImage` / `imageUploadHandler` 由父组件传入。  
  - 需在评论区可获焦的容器或 `MarkdownEditor` 上增加 **paste 事件监听**；若粘贴内容为图片，调用 `onAttachImage`（或 `imageUploadHandler`）并统一使用现有 `attaching` 状态与错误处理。
- `**ui/src/components/MarkdownEditor.tsx`**（若采用方案 B 或需在编辑器内粘贴）  
  - 若粘贴处理放在 `CommentThread` 层并统一走 `onAttachImage`，可不必改 `MarkdownEditor`；若希望在编辑器内粘贴即内联，则需在 `MarkdownEditor` 内监听 paste 并调用 `imageUploadHandler`。
- `**ui/src/pages/IssueDetail.tsx**`  
  - 仅确认传入 `CommentThread` 的 `onAttachImage` / `imageUploadHandler` 已支持文件上传即可，无需改接口。

### 5.2 实现要点

- 使用 `paste` 的 `clipboardData.files` 检测图片；必要时检查 `file.type` 或白名单 MIME。
- 调用现有 `handleAttachFile` 或等价逻辑，复用 `attaching` 状态与 `attachInputRef.current.value = ""` 的清理，避免与点击回形针逻辑重复。
- 若粘贴在 `MarkdownEditor` 内处理，需注意 **不要** 与现有 Markdown 编辑器的粘贴（如粘贴链接、文本）冲突：仅当 `files` 中有图片时才拦截并上传，否则不调用 `preventDefault()`。

---

## 6. 验收标准

- 焦点在评论输入区（至少：Markdown 编辑器内）时，Ctrl+V / Cmd+V 粘贴**一张图片**（如截图、从网页复制的图），该图片作为 **Issue 附件** 上传并出现在附件列表中（方案 A）。
- 上传过程中有 loading 状态；上传失败有明确提示。
- 粘贴纯文本或非图片内容时，行为与未做该功能前一致（不拦截）。
- 与「回形针选文件」上传的附件在列表中的展示、删除、权限一致。
- （可选）文案或 tooltip 中提示支持 Ctrl+V 粘贴图片。

---

## 7. 后续可选增强

- 将粘贴上传能力扩展到 **Issue 描述区**、**新建 Issue 描述** 等其它 Markdown 编辑区域（统一为粘贴即上传并插入内联或附件，由各区域语义决定）。
- 支持一次粘贴多张图片（若剪贴板 API 支持）。
- 方案 C：按焦点区分「粘贴到编辑器 = 内联」「粘贴到操作栏 = 附件」。

---

## 8. 参考

- 现有实现：`CommentThread` 回形针按钮 + `onAttachImage`（IssueDetail 中 `uploadAttachment.mutateAsync`）；`MarkdownEditor` 的 `imageUploadHandler` 用于内联图片。
- 产品规范：`doc/SPEC-implementation.md`、`AGENTS.md`（UI 与 API 约定）。

