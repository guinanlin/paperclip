# Pi Local 对接方必读：model 为必填项

**文档类型**：强制要求说明  
**日期**：2026-03-19  
**致**：Pi Local 对接方（在 Paperclip 中配置或运维 Pi (local) Agent 的团队/人员）  
**目的**：明确 **adapterConfig.model** 为必填项，避免 Run 报错 `Pi requires adapterConfig.model in provider/model format`。

---

## 1. 强制要求

对任何在 Paperclip 中使用的 **Pi (local)** Agent，**必须**在发起 Run（如分配任务、触发 Heartbeat）之前完成以下配置并**保存**：

- **adapterConfig.model**（必填）：须为 **provider/model** 格式，且必须出自该 Agent 所用 command 的 `--list-models` 输出。

**未满足时**：一旦触发 Run，Paperclip 会在执行前校验 `adapterConfig.model`；若为空或格式不符，将直接报错并中止 Run，报错信息为：

```text
Pi requires `adapterConfig.model` in provider/model format.(adapter_failed)
```

Run 状态为失败，不会调用贵方 CLI。

---

## 2. 正确配置方式

1. **在 Paperclip 中**打开该 Agent 的 **Configuration** 页。
2. 在 **Adapter** 区块中，找到 **Model** 下拉框。
3. 从下拉框中选择一个模型（选项来源于 `{command} --list-models` 的解析结果）。  
   - 示例：`groq/llama-3.3-70b-versatile`（若贵方 CLI 的 `--list-models` 输出包含该行）。
4. 点击 **Save** 保存 Agent，确保配置已持久化。
5. 之后再为该 Agent 分配任务或触发 Heartbeat，Run 才会通过 model 校验并正常执行。

---

## 3. 贵方需配合的事项

- **部署/运维**：在将 Pi (local) Agent 投入使用（分配 Issue、开启 Heartbeat 等）之前，务必确认该 Agent 已在 Configuration 中**选择并保存**了 Model；不得在未配置 model 的情况下发起 Run。
- **文档与培训**：若贵方有多人配置或运维 Agent，请将「Pi (local) Agent 必须配置并保存 Model」写入贵方操作手册或培训材料，避免漏配导致 Run 失败。
- **自检**：上线前可用 Paperclip 的 **Adapter Test** 做一次自检；若 Test 通过（含「Configured model: xxx」或至少无「model required」类 error），再开放任务分配与 Heartbeat。

---

## 4. 参考

- 对接步骤（含 Model 选择）：`doc/plans/2026-03-19-pi-local-dtycli-onboarding-steps.md`
- 集成建议与改造要求：`doc/plans/2026-03-18-pi-local-dtycli-integration-recommendation.md`
