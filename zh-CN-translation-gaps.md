# 简体中文翻译待完善项审计

本报告基于当前仓库的 `src/translations/zh-CN.json`、`src/translations/zh-CN-technical.json`、英文基线翻译文件，以及参考源码 `X:\Temp\claude-code-reference` 的初步字符串扫描整理。

> 说明：参考源码扫描采用静态字符串提取，会包含 CSS class、测试文案、内部日志、schema 描述等误报。下列条目优先保留已定位到 UI、命令交互、工具提示、错误提示、远程控制界面的候选项。

## 优先级建议

- **P0：当前 zh-CN 已有翻译质量问题**：应优先修复，风险低、收益明显。
- **P1：高频 CLI / TUI 可见文案**：搜索、加载、权限、任务、工具错误等。
- **P2：Remote Control / Web UI 文案**：如果目标是覆盖 Claude Code 全量体验，应补齐。
- **P3：动态模板字符串 / minified 边缘文案**：可能需要 `postPatchRules`，需谨慎验证。
- **P4：内部协议、日志、测试、schema 文案**：多数不建议翻译，除非确认会直接展示给用户。

## P0：当前简体中文文件中的繁体残留和用词问题

以下问题同时出现在推荐版和技术版简体中文文件中：

| 当前英文 key / 含义 | 当前翻译 | 问题 | 建议 |
| --- | --- | --- | --- |
| `failed_checkout_branch` | `切换分支失敗` | `失敗` 是繁体 | `切换分支失败` |
| `run_status_check_account` | `在 Claude Code 运行 /status 查看账号狀態。` | `狀態` 是繁体 | `在 Claude Code 运行 /status 查看账号状态。` |
| `note_backslash_newlines` | `备注：你已经可以用反斜线 (\\) + Enter 來换行。` | `來` 是繁体；“反斜线”可接受但“反斜杠”更常见 | `备注：你已经可以用反斜杠 (\\) + Enter 来换行。` |

建议同步修复：

- `src/translations/zh-CN.json`
- `src/translations/zh-CN-technical.json`

## P1：通用 TUI / Ink 组件文案

这些文案来自通用选择器、加载态、搜索框，用户很容易直接看到。

| 参考源码位置 | 英文文案 | 建议简体中文 | 处理建议 |
| --- | --- | --- | --- |
| `packages/@ant/ink/src/theme/FuzzyPicker.tsx:73` | `Type to search…` | `输入以搜索…` | 加入翻译映射；如 bundle 中被内联压缩，可能需要 postPatch |
| `packages/@ant/ink/src/theme/FuzzyPicker.tsx:88` | `No results` | `无结果` / `没有结果` | 加入翻译映射 |
| `packages/@ant/ink/src/theme/LoadingState.tsx:43` | `Loading sessions` | `正在加载会话` | 加入翻译映射 |
| `packages/@ant/ink/src/theme/LoadingState.tsx:45` | `Fetching your Claude Code sessions...` | `正在获取你的 Claude Code 会话...` | 加入翻译映射 |
| `src/components/GlobalSearchDialog.tsx:221` | `Type to search…` | `输入以搜索…` | 与 FuzzyPicker 保持一致 |
| `src/components/GlobalSearchDialog.tsx:236` | `Searching…` | `正在搜索…` | 加入翻译映射 |
| `src/components/GlobalSearchDialog.tsx:236` | `No matches` | `无匹配项` | 加入翻译映射 |
| `src/components/QuickOpenDialog.tsx:128` | `Type to search files…` | `输入以搜索文件…` | 加入翻译映射 |
| `src/components/permissions/rules/PermissionRuleList.tsx:695` | `↑↓ navigate · Enter select · Type to search · ←/→ switch · Esc cancel` | `↑↓ 导航 · Enter 选择 · 输入搜索 · ←/→ 切换 · Esc 取消` | 可能需要整句映射，注意按键名保留英文 |
| `src/components/ResumeTask.tsx:132` | `Retrying…` | `正在重试…` | 加入翻译映射 |
| `src/components/ResumeTask.tsx:132` | `Fetching your Claude Code sessions…` | `正在获取你的 Claude Code 会话…` | 与三点版本统一处理 |

## P1：Agent Teams / Remote Agent 相关文案

这些文案与子代理、远程代理、Agent Teams 权限和错误有关，属于新功能高可见文案。

| 参考源码位置 | 英文文案 | 建议简体中文 | 处理建议 |
| --- | --- | --- | --- |
| `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:352` | `Agent Teams is not yet available on your plan.` | `你的套餐暂不支持 Agent Teams。` | 加入翻译映射 |
| `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:573` | `Cannot launch remote agent:\n` | `无法启动远程代理：\n` | 动态模板前缀，可能需要 postPatch |
| `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:586` | `Failed to create remote session` | `创建远程会话失败` | 加入翻译映射 |
| `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:1484` | `Agent tool requires permission to spawn sub-agents.` | `Agent 工具需要获得生成子代理的权限。` | 加入翻译映射 |
| `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:1523` | `Remote agent launched in CCR...` | `已在 CCR 中启动远程代理...` | 加入翻译映射；确认 CCR 是否应保留原文 |
| `packages/builtin-tools/src/tools/AgentTool/UI.tsx:310` | `Remote agent launched` | `远程代理已启动` | 加入翻译映射 |

## P1：内置工具错误和状态文案

这些文案通常在工具不可用、任务输出查询、监控任务启动时展示。

| 参考源码位置 | 英文文案 | 建议简体中文 | 处理建议 |
| --- | --- | --- | --- |
| `packages/builtin-tools/src/tools/PowerShellTool/PowerShellTool.tsx:836` | `PowerShell is not available on this system.` | `此系统上不可用 PowerShell。` | 加入翻译映射 |
| `packages/builtin-tools/src/tools/TaskOutputTool/TaskOutputTool.tsx:222` | `No task found with ID: ${task_id}` | `未找到该 ID 的任务：${task_id}` | 模板字符串，可能需要 postPatch |
| `packages/builtin-tools/src/tools/TaskOutputTool/TaskOutputTool.tsx:237` | `No task found with ID:` | `未找到该 ID 的任务：` | 加入翻译映射或 postPatch 前缀 |
| `packages/builtin-tools/src/tools/MonitorTool/MonitorTool.tsx:169` | `Monitor started (task ${content.taskId}). Output file: ${content.outputFile}` | `监控已启动（任务 ${content.taskId}）。输出文件：${content.outputFile}` | 模板字符串，可能需要 postPatch |
| `packages/acp-link/src/server.ts:513` | `Loading sessions is not supported by this agent` | `此代理不支持加载会话` | 加入翻译映射 |

## P2：Remote Control / Web UI 文案

如果项目目标包含 Claude Code Remote Control 的完整中文体验，这部分需要单独补齐。Web UI 中的 JSX 文案可能不一定都出现在当前 CLI bundle 的同一位置，需要结合实际打包结果验证。

| 参考源码位置 | 英文文案 | 建议简体中文 | 处理建议 |
| --- | --- | --- | --- |
| `packages/remote-control-server/web/src/components/PermissionViews.tsx:33` | `Permission Request` | `权限请求` | 加入翻译映射 |
| `packages/remote-control-server/web/src/components/EventStream.tsx:429` | `Permission Request` | `权限请求` | 与上条统一 |
| `packages/remote-control-server/web/src/components/EventStream.tsx:1025` | `Session interrupted` | `会话已中断` | 加入翻译映射 |
| `packages/remote-control-server/web/src/components/ControlBar.tsx:50` | `Session is closed` | `会话已关闭` | 加入翻译映射 |
| `packages/remote-control-server/web/src/components/ControlBar.tsx:50` | `Type a message...` | `输入消息...` | 加入翻译映射 |
| `packages/remote-control-server/web/src/components/ControlBar.tsx:65` | `Stop` | `停止` | 注意是否与协议/按钮上下文冲突 |
| `packages/remote-control-server/web/src/components/ControlBar.tsx:65` | `Send` | `发送` | 加入翻译映射 |
| `packages/remote-control-server/web/src/components/Navbar.tsx:69` | `No Token` | `无令牌` | 加入翻译映射 |
| `packages/remote-control-server/web/components/ThreadHistory.tsx:200` | `Search threads...` | `搜索会话...` / `搜索线程...` | 需确认产品语义，建议统一为“会话” |
| `packages/remote-control-server/web/components/ai-elements/conversation.tsx:39` | `No messages yet` | `还没有消息` | 加入翻译映射 |
| `packages/remote-control-server/web/components/ai-elements/prompt-input.tsx:282` | `Remove attachment` | `移除附件` | 加入翻译映射 |
| `packages/remote-control-server/web/components/ai-elements/prompt-input.tsx:351` | `Add photos or files` | `添加照片或文件` | 加入翻译映射 |
| `packages/remote-control-server/web/components/ai-elements/prompt-input.tsx:758` | `What would you like to know?` | `你想了解什么？` | 加入翻译映射 |
| `packages/remote-control-server/web/components/model-selector/ModelSelectorPopover.tsx:51` | `Select Model` | `选择模型` | 加入翻译映射 |
| `packages/remote-control-server/web/src/components/NewSessionDialog.tsx:62` | `My session` | `我的会话` | 加入翻译映射 |

## P2：搜索、选择、空状态文案统一性

建议统一以下词汇，避免同类 UI 出现多个译法：

| 英文 | 推荐版建议 | 技术版建议 | 备注 |
| --- | --- | --- | --- |
| `Type to search…` | `输入以搜索…` | `输入以搜索…` | 通用搜索 placeholder |
| `Search threads...` | `搜索会话...` | `搜索会话...` | 如果源码语义确认是 thread，可用“线程” |
| `No results` | `没有结果` | `无结果` | 推荐版可更自然，技术版更短 |
| `No matches` | `没有匹配项` | `无匹配项` | 与搜索结果保持一致 |
| `Searching…` | `正在搜索…` | `正在搜索…` | 保留省略号样式 |
| `Loading sessions` | `正在加载会话` | `正在加载会话` | 与 `Fetching sessions` 区分不大，可统一 |
| `Fetching your Claude Code sessions...` | `正在获取你的 Claude Code 会话...` | `正在获取 Claude Code 会话...` | 技术版可少用“你的” |

## P3：可能需要 postPatch 的动态 / 模板字符串

以下文案包含变量、换行或运行时拼接。仅靠 JSON key 精确替换可能无法覆盖，需要检查最终 `cli.js` 中的压缩结果，再添加 version-resilient regex 规则。

| 源码位置 | 模板 / 动态文案 | 建议处理 |
| --- | --- | --- |
| `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:573` | `Cannot launch remote agent:\n${reasons}` | 针对前缀做正则替换，保留 `${reasons}` |
| `packages/builtin-tools/src/tools/TaskOutputTool/TaskOutputTool.tsx:222` | `No task found with ID: ${task_id}` | 优先替换静态前缀 `No task found with ID:` |
| `packages/builtin-tools/src/tools/MonitorTool/MonitorTool.tsx:169` | `Monitor started (task ${content.taskId}). Output file: ${content.outputFile}` | 使用捕获组保留变量部分 |
| `packages/remote-control-server/web/src/components/EventStream.tsx:*` | 状态流和权限请求组合文案 | 先确认是否打进 CLI bundle，再决定 postPatch |

添加 postPatch 规则时建议遵循当前项目约束：

- 避免绑定 minified 变量名。
- 优先匹配稳定英文片段和标点结构。
- 保留变量插值、路径、任务 ID、文件路径等动态内容。
- 每条规则都需要通过 `node --check` 验证。

## P4：暂不建议直接翻译的类别

静态扫描中会出现大量候选，但以下类别不宜直接加入翻译表：

- CSS class / Tailwind class。
- 测试用字符串和 mock 数据。
- 内部 telemetry、debug log、metric name。
- API 协议字段、header、schema key。
- 工具参数名、MCP JSON schema 字段。
- Markdown 示例中的命令参数或 shell 片段。
- 可能被 Claude Code 逻辑判断依赖的固定英文枚举值。

如果某个短字符串同时可能是协议值和 UI 文案，例如 `Accept`、`Default`、`Allow`、`Deny`、`Ask`、`Auto`、`Plan`、`Running `，应继续使用 `UNSAFE_STRINGS` / 上下文感知替换策略，而不是无条件全局替换。

## 建议后续实施顺序

1. 先修复 `zh-CN.json` 和 `zh-CN-technical.json` 中的繁体残留。
2. 补齐 P1 中通用 TUI、Agent、内置工具相关静态文案。
3. 构建后检查 `dist/translations` 是否同步复制。
4. 用真实 Claude Code bundle 或测试 fixture 验证新增 key 是否命中。
5. 对未命中的 P1/P2 文案，再在 `src/core/patcher.ts` 的 locale post-patch 规则中补正则。
6. 最后处理 Remote Control Web UI，确认这些文案是否存在于当前可 patch 的 bundle 中。

## 验证建议

每轮翻译更新后建议执行：

```bash
npm run build
npm run lint
npm test
node dist/cli.js list
node dist/cli.js status
```

如果涉及 postPatch 规则，额外建议：

```bash
node --check dist/cli.js
```

并在本机 Claude Code 测试环境中运行：

```bash
cc-i18n patch --lang zh-CN
claude --version
```

确认 CLI 仍能正常启动，且高频 UI 文案已经显示为简体中文。
