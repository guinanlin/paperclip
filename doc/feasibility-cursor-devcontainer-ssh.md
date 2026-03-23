# 可行性研究：Dev Container / SSH 场景下 Paperclip 与 Cursor 的对接方式

**Issue**: DTY-38  
**日期**: 2026-03-16  
**作者**: T40 (Full-Stack Engineer)

## 1. 背景与问题

- 当前 Paperclip 通过 **Cursor Local 适配器** 调用 Cursor 的本地 CLI（默认命令 `agent`），在服务端所在机器上以子进程方式执行，工作目录为项目配置的 `cwd`（或项目 workspace 的本地路径）。
- 若开发者使用 **Dev Container** 或 **SSH 远程** 连接 Cursor 进行开发，则实际开发环境（代码、终端、依赖）在容器内或远程主机上，与「Paperclip 服务端 + 本地 spawn 进程」的默认模型可能不一致。
- 本报告说明在这些场景下如何对接、可行方案及取舍。

## 2. 当前 Cursor Local 适配器的工作方式（简要）

- Paperclip 服务端在**解析出的 workspace 目录**下，以 `config.command`（默认 `agent`）为可执行文件，执行子进程。
- 典型调用形如：`agent -p --output-format stream-json --workspace <cwd>`，且会注入 `PAPERCLIP_*` 等环境变量。
- 因此存在两条硬约束：
  1. **进程与服务器同机**：子进程必须在 Paperclip 服务端能 `spawn` 的同一台机器上运行。
  2. **cwd 可访问**：`cwd` 必须是该机器上存在且服务端进程可访问的绝对路径。

因此，对接方式本质是：**在何种机器/环境中运行 Paperclip 服务端，以及在何种机器/环境中运行 `agent` 进程**。

## 3. Dev Container 场景

**特征**：开发在容器内进行，Cursor 通过 Dev Container 扩展连到该容器；代码与依赖在容器内，宿主机上可能是挂载的同一份代码。

### 方案 A：Paperclip 服务端与 Cursor 同处 Dev Container 内（推荐）

- **做法**：在 Dev Container 内安装并运行 Paperclip 服务端（及 DB 等依赖），项目 workspace 的 `cwd` 配置为容器内路径（如 `/workspaces/<project>`）。
- **结果**：heartbeat 在容器内 spawn `agent`，使用的就是容器内的 Cursor CLI 与工作目录，与 Cursor 当前连接的 Dev Container 环境一致。
- **优点**：实现简单、行为与「本地 Cursor + 本地 Paperclip」一致，仅运行环境从宿主机改为容器。
- **注意**：需在 Dev Container 内安装 Cursor Agent CLI 并确保 `agent` 在 PATH 中；容器需能访问 Paperclip API（若 API 在宿主机或别处，需网络/端口映射）。

### 方案 B：Paperclip 在宿主机，agent 在容器内执行

- **做法**：Paperclip 仍跑在宿主机，通过「在容器内执行命令」的方式触发 agent（例如 `docker exec <container> agent ...` 或容器内常驻一个接收触发的 runner，再在容器内执行 `agent`）。
- **结果**：heartbeat 的「执行上下文」在容器内，cwd 为容器内路径。
- **优点**：服务端可与其他非容器化服务统一部署。
- **缺点**：需要额外实现「从宿主机到容器」的触发通道（如 docker exec、或容器内 runner + 轮询/Webhook），实现与运维复杂度更高；且需保证容器内已安装并配置好 Cursor CLI 与 Paperclip 技能/环境变量。

### 方案 C：Paperclip 在宿主机，agent 在宿主机运行（当前默认行为）

- **做法**：不改变现有架构；项目 workspace 的 `cwd` 为宿主机上的路径（与容器挂载路径一致）。
- **结果**：spawn 的是**宿主机**上的 `agent`，使用宿主机上的 Cursor CLI 与宿主机路径。
- **局限**：若开发者主要是在 Dev Container 内开发（依赖、工具链都在容器内），则宿主机上的 `agent` 可能缺少相同依赖或环境，与 Cursor 实际使用的 Dev Container 环境不一致。仅当宿主机与容器环境高度一致（或仅做轻量操作）时才合适。

**小结（Dev Container）**：优先考虑 **方案 A**（Paperclip 进 Dev Container）；若必须服务端在宿主机，再考虑方案 B；方案 C 适用于环境一致或轻量使用的场景。

## 4. SSH 远程开发场景

**特征**：Cursor 通过 Remote-SSH 连到远程主机，代码与终端都在远程；本地只有 Cursor 客户端。

### 方案 D：Paperclip 服务端与 agent 均在远程主机（推荐）

- **做法**：在**同一台远程主机**上部署 Paperclip 服务端（及 DB 等），项目 workspace 的 `cwd` 配置为远程主机上的项目路径。
- **结果**：heartbeat 在远程主机上 spawn `agent`，与 Cursor Remote-SSH 使用的环境完全一致。
- **优点**：逻辑与本地/Dev Container 一致，无需改适配器；远程主机上安装 Cursor CLI 并配置好技能与 `PAPERCLIP_*` 即可。
- **注意**：需在远程主机安装 Node 与 Paperclip 所需依赖、Cursor Agent CLI；若使用嵌入式 DB（如 PGlite），数据在远程主机上。

### 方案 E：Paperclip 在本地/中心，通过远程执行触发 agent

- **做法**：Paperclip 服务端在本地或中心机房，通过 SSH 在远程主机上执行命令，例如：  
  `ssh user@remote "cd /path/to/project && agent -p ..."`，或远程主机上有一个 runner 进程（轮询 Paperclip 或接收 Webhook），在远程执行 `agent`。
- **结果**：执行上下文在远程，cwd 为远程路径。
- **优点**：服务端集中部署，多台远程机可共用同一 Paperclip。
- **缺点**：需要新增「远程执行」或「远程 runner」的集成（当前 Cursor Local 适配器仅支持本机 spawn）；需处理 SSH 密钥、环境变量注入、超时与错误上报等，实现与运维成本较高。

### 方案 F：仅在本地跑 Paperclip 与 agent（不推荐用于纯 SSH 开发）

- **做法**：Paperclip 与 `agent` 都在开发者本地机器，workspace 的 `cwd` 为本地路径。
- **局限**：若实际开发完全在远程（代码、依赖、终端都在远程），则本地既没有完整代码也没有一致环境，不适合作为主要方案；仅适合「本地也有一份同步代码且主要在本机开发」的混合用法。

**小结（SSH）**：优先在**远程主机**上部署 Paperclip + agent（方案 D）；若确有集中式需求，再考虑方案 E 的远程执行/runner，并需在适配器或新适配器层面做扩展。

## 5. 连接方式汇总

| 场景           | 推荐对接方式                         | 核心要点 |
|----------------|--------------------------------------|----------|
| Dev Container  | Paperclip 与 agent 同处容器内        | 容器内安装 CLI，cwd 用容器内路径 |
| SSH 远程       | Paperclip 与 agent 同在远程主机      | 远程主机安装服务端 + CLI，cwd 用远程路径 |
| 混合/集中部署  | 宿主机/中心触发容器或远程执行 agent  | 需实现远程/容器内执行通道（非当前适配器默认能力） |

## 6. 实现与配置建议

- **无需改代码即可尝试**：
  - **Dev Container**：在 devcontainer 内安装并启动 Paperclip（如 `pnpm dev`），在容器内配置项目 workspace 的 `cwd` 为容器内项目路径；确保容器内可执行 `agent` 并已配置 Paperclip 技能。
  - **SSH**：在 SSH 目标机上安装并运行 Paperclip，项目 workspace 的 `cwd` 指向该机上的项目路径；同样确保该机上 `agent` 可用且技能已配置。
- **若需「中心服务端 + 远程/容器内执行」**：需在现有 Cursor Local 适配器上扩展「远程执行」能力（如通过 SSH 或容器内 runner 调用 `agent`），或新增适配器类型，由产品/架构决定优先级。

## 7. 结论

- **Dev Container**：在容器内运行 Paperclip 与 Cursor CLI，使 heartbeat 与 Cursor 使用同一容器环境，**可行且推荐**。
- **SSH**：在远程主机上运行 Paperclip 与 Cursor CLI，使 heartbeat 与 Cursor Remote-SSH 使用同一主机环境，**可行且推荐**。
- 两种场景下均不需要改 Cursor Local 适配器的核心逻辑，只需**把 Paperclip 与 agent 部署到与 Cursor 相同的运行环境**（容器或远程主机），并正确配置 `cwd` 与 CLI 环境。
- 若未来需要「单一中心 Paperclip 服务端 + 多台远程/多容器内 agent」，则需在适配器或新通道上实现远程/容器内执行与鉴权，属于后续演进范围。

---

## 8. 补充：宿主机单点部署的可行性（Cursor 已在宿主机打开并连接 Dev Container / SSH 时）

**典型诉求**：Cursor 已经在宿主机上打开，并且已连接 Dev Container 或 SSH Remote；希望**只在宿主机安装 Paperclip**，不在每个容器/每台远程机上都装一套，是否可行、有什么相对简单的方式？

### 8.1 当前技术事实

- Paperclip 触发的是 **`agent` 子进程**，该进程必须在一个具体环境里跑（宿主机、容器内或远程机上）。
- Cursor 连接 Dev Container / SSH Remote 时：**编辑和终端**在容器/远程，但 **`agent` CLI 若在宿主机执行**，则命令（如 `pnpm install`、`node`）会在**宿主机**上执行，而不是在 Cursor 当前连接的容器/远程环境里。
- 因此：**仅把 Paperclip 和 agent 都放在宿主机、用宿主机路径当 cwd**，只有在「宿主机上的工具链（Node、pnpm 等）与容器/远程一致或兼容」时才能稳定工作；否则 agent 可能找不到命令或版本不一致。

### 8.2 可行且相对简单的几种方式

| 目标 | 做法 | 是否「只在宿主机装」 | 说明 |
|------|------|----------------------|------|
| 环境一致时宿主机单点 | Paperclip + agent 都在宿主机，workspace 的 cwd 用宿主机上对应目录（与容器挂载或与远程同步的路径） | ✅ 是 | 等价上文方案 C / F；依赖宿主机与容器/远程环境一致，否则易出问题。 |
| 服务端单点，执行端只装 CLI | Paperclip 服务端只在宿主机（或中心）；容器/远程**只装 Cursor Agent CLI**（不装 Paperclip 服务端），通过 `docker exec` / SSH 在容器/远程执行 `agent ...` | ⚠️ 折中 | 不在「每处」装完整 Paperclip，但每个要跑 agent 的容器/远程仍需能执行 `agent` 并配好 PAPERCLIP_* 等；需在适配器或运维上实现触发通道（见方案 B、E）。 |
| Cursor 支持「在已连接上下文中跑 agent」 | 若 Cursor 未来提供「在当前 Dev Container / SSH 上下文中运行 agent」的能力（由宿主机 Cursor 调度） | ✅ 理论可行 | 当前可行性研究中未查到该能力，需向 Cursor 产品/文档确认；若有，则可实现真正的宿主机单点 + 执行在容器/远程。 |

### 8.3 结论（针对「不想在每个地方都装」）

- **最简单、且不改代码**：当宿主机与 Dev Container/远程的**工具链一致**（或只做轻量操作）时，可仅在宿主机安装 Paperclip 和 Cursor CLI，workspace 指向宿主机路径；agent 在宿主机执行，读写同一份代码（挂载/同步）。
- **希望服务端只装一份、执行在容器/远程**：需要「服务端在宿主机 + 在容器/远程只装 agent CLI，并通过 docker exec / SSH 或 runner 触发」；当前适配器不直接支持，需做扩展或运维脚本。
- **真正的单点（宿主机不跑 agent，只跑 Cursor + Paperclip）**：取决于 Cursor 是否支持「在已连接的 Dev Container / SSH 上下文中运行 agent」；需与 Cursor 能力对齐后再更新本结论。

---

## 9. 典型场景：Ubuntu 宿主机 + 本机 Docker Dev Container

**场景**：宿主机是 Ubuntu，已安装 Paperclip 和 Docker；Dev Container 跑在同一台机的 Docker 容器里，开发者在本机用 Cursor 打开并连接该 Dev Container。问：是否可行？若可行，具体如何 work？

### 9.1 结论：可行，有两种典型用法

| 方式 | 谁跑在哪 | 如何 work | 前提/代价 |
|------|----------|-----------|------------|
| **A. 全部在宿主机** | Paperclip 与 agent 都在 Ubuntu 宿主机 | 项目 workspace 的 `cwd` 配成**宿主机上**被挂载进容器的那条路径（例如 `/home/user/project`）。Heartbeat 在宿主机 spawn `agent`，`--workspace` 即该路径；agent 读写与容器内同一份文件（bind mount）。 | 若 agent 需要执行 `pnpm`/`node` 等命令，这些命令会在**宿主机**执行，故宿主机也需安装对应工具链；否则仅适合以文件编辑为主、或宿主机与容器环境一致的情况。 |
| **B. Paperclip 在宿主机，agent 在容器内** | Paperclip 在宿主机；`agent` 在「当前开发用的那个容器」里执行 | 宿主机通过 `docker exec <容器> agent -p ...`（或容器内常驻 runner 接收触发）在**该容器内**执行 agent。执行环境与 Cursor 连接的 Dev Container 完全一致。 | 容器内需预装 Cursor Agent CLI 并配置 PAPERCLIP_* 等；Paperclip 需能解析「当前项目对应哪个容器」（如由用户配置 container 名/id，或通过 Docker label 等约定）。当前 Cursor Local 适配器不直接支持，需扩展或外挂脚本。 |

### 9.2 方式 A 的具体 work 方式（不改代码、立即可用）

1. **宿主机**：安装并运行 Paperclip（如 `pnpm dev`），安装 Cursor 且确保 `agent` CLI 可用。
2. **项目 / Workspace**：在 Paperclip 里为该项目配置的 workspace 的 `cwd` 填**宿主机上的绝对路径**，且该路径需与 Dev Container 里项目的 bind mount 源一致（例如容器内 `/workspaces/myapp` 对应宿主机 `/home/user/myapp`，则 cwd 填 `/home/user/myapp`）。
3. **Heartbeat**：Paperclip 在宿主机上 spawn `agent -p --output-format stream-json --workspace /home/user/myapp ...`，agent 在宿主机进程里跑，工作目录即该路径；对文件的修改会因 bind mount 在容器内立即可见，Cursor 连接的 Dev Container 里看到的同一份代码。
4. **限制**：agent 若执行 `pnpm install`、`node test.js` 等，这些命令在宿主机执行；若宿主机未装或版本与容器不一致，会失败或行为不符预期。此时要么在宿主机装齐工具链，要么采用方式 B 让 agent 在容器内执行。
</think>
正在获取文档当前 revision 并 PUT 更新。
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
Shell
