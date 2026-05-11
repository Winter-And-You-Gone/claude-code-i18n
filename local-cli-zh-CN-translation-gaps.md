# 本机 Claude Code cli.js 简体中文翻译缺陷审计

本报告以本机已安装的 Claude Code bundle 为准，而不是参考源码仓库。

- Claude Code 版本：`@anthropic-ai/claude-code@2.1.112`
- 本机 bundle：`C:\Users\Winter\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\cli.js`
- 当前翻译基线：`src/translations/en.json`、`src/translations/en-technical.json`
- 审计方式：在本机 `cli.js` 中抽查高可见英文 UI / 错误 / 状态文案，并检查这些英文是否已经存在于当前翻译基线中。

> 说明：`cli.js` 是压缩后的大 bundle，很多命中位于超长单行内，传统行号参考价值有限。下表中的位置以 `cli.js` 字符偏移量为主。

## 结论

本机 `cli.js` 中仍存在一批当前翻译基线未覆盖的英文文案，主要集中在：

1. 底部快捷键提示、任务用时、模式切换提示等 TUI 状态栏文案。
2. Agent / Remote Agent 新功能文案。
3. 内置工具运行结果和错误消息。
4. Resume / Conversation 会话恢复相关文案。
5. 自动更新、安装、认证相关错误。
6. 少数短按钮文案命中真实 bundle，但需要谨慎处理，避免破坏协议值或内部枚举。

## P0：底部快捷键提示 / 状态栏明显漏翻

这批是用户在 TUI 左下角、任务完成状态、帮助/提示卡里会直接看到的高频文案，上一轮关键词过滤遗漏了，优先级应高于普通工具错误。下面部分建议译文刻意加入少量原版风格的小符号/表情，用于观察终端观感；真正落地时仍应避开协议值、错误栈和对齐敏感位置。

| 类别 | cli.js 位置 | 英文文案 / 拼接片段 | 当前基线 | 建议简体中文 | 建议处理 |
| --- | ---: | --- | --- | --- | --- |
| 底部提示 | `12357987` | `? for shortcuts` | 未覆盖 | `? 快捷键` / `? 查看快捷键` | 短句 UI，可加入映射；若未命中则 postPatch |
| 完成状态 | `8138632` | `${EV} Worked for ${C5(...)}` | 未覆盖 | `${EV} 已工作 ${C5(...)}` / `${EV} 用时 ${C5(...)}` | 模板拼接，建议 postPatch；保留原有状态符号 `${EV}` |
| 空闲状态 | `8138443` | `${EV} Idle` | 部分已翻译但仍有英文拼接 | `${EV} 空闲中` | 检查 `Idle` 是否被上下文替换，避免全局替换内部状态 |
| 团队状态 | `8138443` | `teammates running` | 未覆盖 | `队友运行中` | 拼接片段，建议 postPatch |
| 输入框快捷键 | `10544566` | `auto-accept edits` | 未覆盖 | `自动接受修改` | `A8` 快捷键 action 文案，建议加入 action 翻译或 postPatch |
| 输入框快捷键 | `10546059` | `paste images` | 未覆盖 | `粘贴图片` | 同上 |
| 输入框快捷键 | `10546312` | `switch model` | 未覆盖 | `切换模型` | 同上 |
| 引导提示 | `10922191` | `Press shift+tab to cycle permission modes. Each mode changes how much Claude asks before acting:` | 未覆盖 | `按 shift+tab 循环切换权限模式。每种模式会改变 Claude 在执行前询问你的频率：` | 长句，加入映射或 postPatch |
| 启动提示 | `12551112` | `Hit ${...} to cycle between default mode, auto-accept edit mode, and plan mode` | 未覆盖 | `按 ${...} 在默认模式、自动接受修改模式和规划模式之间切换` | 模板字符串，建议 postPatch |
| 图片提示 | `12389050` | `No image found in clipboard. Use ${g1} to paste images.` | 未覆盖 | `剪贴板中没有找到图片。使用 ${g1} 粘贴图片。` | 模板字符串，建议 postPatch |
| 图片提示 | `12550019` | `Did you know you can drag and drop image files into your terminal?` | 未覆盖 | `小提示：可以把图片文件直接拖放到终端里` / `💡 你可以把图片文件直接拖放到终端里` | 启动提示，可加入映射；emoji 版仅用于友好提示 |
| 图片提示 | `12550019` | `Paste images into Claude Code using control+v (not cmd+v!)` | 未覆盖 | `使用 control+v（不是 cmd+v！）将图片粘贴到 Claude Code` | macOS 提示，加入映射 |
| Esc 提示 | `12550019` | `Double-tap esc to rewind the conversation to a previous point in time` | 未覆盖 | `双击 esc 可将对话回退到之前的时间点` / `↩ 双击 esc 可回退到之前的对话节点` | 加入映射；符号版适合启动小贴士 |
| Agent 提示 | `12551309` | `Use /agents to optimize specific tasks. Eg. Software Architect, Code Writer, Code Reviewer` | 未覆盖 | `使用 /agents 优化特定任务。例如：软件架构师、代码编写器、代码审查器` / `🤖 使用 /agents 优化特定任务，例如软件架构师、代码编写器、代码审查器` | 加入映射；emoji 版适合 tips，不建议用于工具协议输出 |
| 统计页页脚 | `10450816` | `↓ stats` | 未覆盖 | `↓ 统计` | UI 短句，postPatch 更稳 |
| 统计页页脚 | `10450826` | `↑ tabs` | 未覆盖 | `↑ 标签页` | UI 短句，postPatch 更稳 |
| 统计页页脚 | `10450969` | `r to cycle dates` | 未覆盖 | `r 切换日期` | postPatch |
| 统计页页脚 | `10450988` | `ctrl+s to copy` | 未覆盖 | `ctrl+s 复制` | postPatch |
| Team 面板页脚 | `12310907` | `sync cycle modes for all` | 未覆盖 | `同步切换所有人的模式` | 拼接短句，postPatch |
| Team 面板页脚 | `12310907` | `h hide/show · H hide/show all` | 未覆盖 | `h 隐藏/显示 · H 全部隐藏/显示` | 当前同一 footer 已有中文但残留英文，建议整段 postPatch |
| Team 面板页脚 | `12310907` | `Esc close` | 部分中文混杂英文 | `Esc 关闭` | 当前上下文已有中文但残留 `hide/show`、`close` |
| Team 面板页脚 | `12314330` | `cycle mode` | 未覆盖 | `切换模式` | 拼接短句，postPatch |
| 选择页脚 | `11380984` | `${...} switch tabs · ${...} navigate · Enter select · Esc close` | 未覆盖 | `${...} 切换标签页 · ${...} 导航 · Enter 选择 · Esc 关闭` | 权限/面板页脚整句，postPatch |
| 搜索/选择页脚 | `11244236` | `Type to filter · Enter/↓ select · ↑ tabs · Esc clear` | 未覆盖 | `输入筛选 · Enter/↓ 选择 · ↑ 标签页 · Esc 清除` | 整句映射或 postPatch |
| 搜索/选择页脚 | `11244436` | `↑↓ navigate · Enter select · Type to search · ←/→ switch · Esc cancel` | 未覆盖 | `↑↓ 导航 · Enter 选择 · 输入搜索 · ←/→ 切换 · Esc 取消` | 整句映射或 postPatch |
| 搜索/选择页脚 | `11244200` | `←/→ tab switch · ↓ return · Esc cancel` | 未覆盖 | `←/→ 切换标签页 · ↓ 返回 · Esc 取消` | 整句映射或 postPatch |
| 搜索/选择页脚 | `11244200` | `Enter approve · r retry · ↑↓ navigate · ←/→ switch · Esc cancel` | 未覆盖 | `Enter 批准 · r 重试 · ↑↓ 导航 · ←/→ 切换 · Esc 取消` | 整句映射或 postPatch |
| 历史提示 | `12257503` | `search history` | 未覆盖 | `搜索历史` | 快捷键 description，可加入映射或 postPatch |
| 压缩提示 | `8467980` | `✻ Conversation compacted (${K} for history)` | 未覆盖 | `✻ 对话已压缩（${K} 查看历史）` | 原文已有 `✻` 符号，建议保留；模板拼接需 postPatch |
| 压缩摘要 | `8379864` | `Compact summary` | 未覆盖 | `压缩摘要` / `✻ 压缩摘要` | 静态标题，可加入映射；若同屏已有 `✻` 则不重复添加 |

## P0：确认存在且建议优先补齐的高可见文案

| 类别 | cli.js 位置 | 英文文案 | 当前基线 | 建议简体中文 | 建议处理 |
| --- | ---: | --- | --- | --- | --- |
| Agent Teams | `8513614` | `Agent Teams is not yet available on your plan.` | 未覆盖 | `你的套餐暂不支持 Agent Teams。` | 加入 `en*.json` / `zh-CN*.json`；错误/限制类不建议加 emoji |
| Remote Agent | `8501795` | `Remote agent launched` | 未覆盖 | `远程代理已启动` / `🚀 远程代理已启动` | 成功状态可考虑轻量 emoji，需确认终端宽度观感 |
| Remote Agent | `8526168` | `Remote agent launched in CCR.` | 未覆盖 | `已在 CCR 中启动远程代理。` / `🚀 已在 CCR 中启动远程代理。` | CCR 保留原文；成功状态可选 emoji |
| PowerShell 工具 | `9564942` | `PowerShell is not available on this system.` | 未覆盖 | `此系统上不可用 PowerShell。` | 加入翻译映射；错误类不建议加 emoji |
| TaskOutput 工具 | `9004518` | `No task found with ID: ${q}` | 未覆盖 | `未找到该 ID 的任务：${q}` | 需要 postPatch 或前缀替换；工具结果不建议加 emoji |
| Monitor 工具 | `9200826` | `Monitor started ...` | 未覆盖 | `监控已启动 ...` / `⏱ 监控已启动 ...` | UI 组件拼接，建议 postPatch；若用于可见状态可保留符号版 |
| Conversation Resume | `11084493` | `No conversations found to resume` | 未覆盖 | `没有可恢复的会话` | 加入翻译映射 |
| Conversation Resume | `11084567` 附近 | `Failed to load conversations` | 未覆盖 | `加载会话失败` | 加入翻译映射；错误类不建议加 emoji |
| Resume 选择器 | `11196372` | `Error loading Claude Code sessions` | 未覆盖 | `加载 Claude Code 会话出错` | 加入翻译映射 |
| Resume 选择器 | `11196515` | `Press Ctrl+R to retry` | 未覆盖 | `按 Ctrl+R 重试` | 当前上下文后半句已有 `取消`，建议整句 postPatch |
| Resume 选择器 | `11196744` | `No Claude Code sessions found` | 未覆盖 | `没有找到 Claude Code 会话` | 加入翻译映射 |

## P1：安装、更新、认证相关文案

这些文案不一定每天出现，但用户遇到环境问题时会直接看到，建议补齐。

| 类别 | cli.js 位置 | 英文文案 / 片段 | 当前基线 | 建议简体中文 | 建议处理 |
| --- | ---: | --- | --- | --- | --- |
| 自动更新 | `12245138` | `Update available` | 未覆盖 | `有可用更新` | 注意该命中位于日志/自动更新路径，确认是否展示给用户后再翻译 |
| 安装 keybinding | `4392435` | `Failed to install ${q} terminal Shift+Enter key binding` | 未覆盖 | `安装 ${q} 终端 Shift+Enter 快捷键绑定失败` | 模板字符串，建议 postPatch |
| 安装 keybinding | `4392349` 附近 | `Installed ${q} terminal Shift+Enter key binding` | 未覆盖 | `已安装 ${q} 终端 Shift+Enter 快捷键绑定` | 模板字符串，建议 postPatch |
| OAuth | `2317920` | `Authentication failed: Invalid authorization code` | 未覆盖 | `认证失败：授权码无效` | 加入翻译映射或 postPatch |
| Token 校验 | `3385044` | `Invalid token signature:` | 未覆盖 | `令牌签名无效：` | 可能偏内部错误；低优先级 |

## P1：Grep / 搜索工具结果文案

本机 bundle 中确认存在以下文案，但其中部分属于工具结果协议输出，翻译时要确认不会影响测试或工具调用契约。

| 类别 | cli.js 位置 | 英文文案 | 当前基线 | 建议简体中文 | 建议处理 |
| --- | ---: | --- | --- | --- | --- |
| Grep 工具结果 | `8690954` | `No matches found` | 未覆盖 | `未找到匹配项` | 如该文本直接展示给用户，可加入映射 |
| Grep 工具结果 | `8690990` 附近 | `Showing results with pagination = ${J}` | 未覆盖 | `显示分页结果 = ${J}` | 工具结果文本，谨慎翻译 |
| Grep 工具结果 | `8691040` 附近 | `Found ${M} total ...` | 未覆盖 | `共找到 ${M} 个...` | 模板复杂，建议暂缓 |

## P2：短按钮 / 通用词命中但需谨慎

本机 `cli.js` 中确认存在以下短字符串，但这些词经常同时作为 UI 文案、协议值、枚举值或状态值出现。当前项目已经有 `UNSAFE_STRINGS`，不建议简单全局替换。

| cli.js 位置 | 英文 | 风险 | 建议 |
| ---: | --- | --- | --- |
| `1002926` | `Stop` | 可能是按钮，也可能是状态/控制值 | 只在明确 UI 上下文中替换 |
| `220234` | `Send` | 可能是按钮，也可能是动作名 | 只在明确 UI 上下文中替换 |
| 多处 | `Allow` / `Deny` / `Ask` / `Plan` / `Default` | 当前已列入不安全字符串或上下文敏感字符串 | 保持上下文感知替换，不要全局替换 |

## 与上一份源码候选报告的差异

上一份 `zh-CN-translation-gaps.md` 是基于参考源码 `X:\Temp\claude-code-reference` 的候选审计，适合发现“可能应翻译”的源码文案。

本报告只记录本机安装的 `cli.js` 中已经确认存在的缺口，因此优先级更高，更适合直接指导当前项目适配 Claude Code `2.1.112`。

## 建议实施顺序

1. 先补齐 P0 的静态文案：Agent Teams、Remote Agent、PowerShell、Conversation Resume。
2. 对 `No task found with ID: ${q}`、`Monitor started ...`、keybinding 安装文案这类模板字符串，检查当前 JSON 精确替换是否能命中；若不能命中，添加 locale post-patch regex。
3. 对 `Stop`、`Send` 等短词不要全局加入普通替换，优先通过上下文替换或保持不动。
4. 每次新增翻译后执行：

```bash
npm run build
npm run lint
npm test
```

5. 如果新增了 postPatch 规则，额外对实际 patch 后的 Claude Code `cli.js` 执行语法验证，并运行：

```bash
cc-i18n patch --lang zh-CN
claude --version
```

## 建议新增翻译草案

下面是可优先添加到英文基线和简体中文文件的候选项：

```json
{
  "agent_teams_unavailable": "Agent Teams is not yet available on your plan.",
  "remote_agent_launched": "Remote agent launched",
  "remote_agent_launched_ccr": "Remote agent launched in CCR.",
  "powershell_unavailable": "PowerShell is not available on this system.",
  "no_conversations_resume": "No conversations found to resume",
  "failed_load_conversations": "Failed to load conversations",
  "no_matches_found": "No matches found"
}
```

推荐版简体中文：

```json
{
  "agent_teams_unavailable": "你的套餐暂不支持 Agent Teams。",
  "remote_agent_launched": "远程代理已启动",
  "remote_agent_launched_ccr": "已在 CCR 中启动远程代理。",
  "powershell_unavailable": "此系统上不可用 PowerShell。",
  "no_conversations_resume": "没有可恢复的会话",
  "failed_load_conversations": "加载会话失败",
  "no_matches_found": "未找到匹配项"
}
```

技术版简体中文可以沿用同一组翻译，或将 `你的套餐` 调整为更正式的 `当前套餐`。

## 待进一步确认

以下内容已在本机 `cli.js` 中通过本次抽查确认存在，但处理优先级或打包位置仍需要进一步判断：

- `Error loading Claude Code sessions`
- `No Claude Code sessions found`
- `Press Ctrl+R to retry`
- `Compact summary`
- `Conversation compacted`
- `search history`
- `Permission Request`
- `Session interrupted`
- Remote Control Web UI 的大部分文案

如果后续目标是完整覆盖 Remote Control Web UI，需要单独确认这些 Web UI 字符串是否被打包进当前 npm 安装的 `cli.js`，还是只存在于源码仓库或其他构建产物中。
