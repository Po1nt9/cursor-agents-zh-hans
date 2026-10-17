# 术语表

界面译文尽量跟 VS Code 简体中文语言包一致。Cursor 自己的概念单独列在下面。语言包请从扩展市场安装 `MS-CEINTL.vscode-language-pack-zh-hans`，本仓库不附带它。

## 跟 VS Code 语言包对齐

| English | 简体中文 |
| --- | --- |
| File / Edit / Selection / View / Go / Run / Terminal / Help | 文件 / 编辑 / 选择 / 查看 / 转到 / 运行 / 终端 / 帮助 |
| Command Palette | 命令面板 |
| Preferences | 首选项 |
| Settings | 设置 |
| Keyboard Shortcuts | 键盘快捷方式 |
| Source Control | 源代码管理 |
| Explorer | 资源管理器 |
| Search / Find / Replace | 搜索 / 查找 / 替换 |
| Problems / Output / Debug Console | 问题 / 输出 / 调试控制台 |
| Extensions | 扩展 |
| Workspace | 工作区 |
| Undo / Redo | 撤消 / 恢复 |
| Save / Save As... | 保存 / 另存为... |
| Commit / Branch / Changes | 提交 / 分支 / 更改 |
| Cancel / Delete / Rename / Close / Open | 取消 / 删除 / 重命名 / 关闭 / 打开 |
| Accept / Apply | 接受 / 应用 |
| Account | 账户 |
| Untitled | 无标题 |
| Chat | 聊天 |

## 本包的决定

| English | 简体中文 | 原因 |
| --- | --- | --- |
| Agent / Agents | 智能体 | VS Code Copilot 语言包把 agent 译成「代理」。这里改用「智能体」：Agents Window 是产品界面，而「代理」在中文里也指 proxy。短标签只在整段文本完全等于 `Agent` 时替换，不会在代码里做片段替换。 |
| Agents Window | 智能体窗口 | 官方文档里的 Open Agents Window，在 3.25.6 的包里实际写成 New Agents Window、Open or Focus Agents Window (Glass)。 |
| Glass | Glass | 内部代号，不翻译。命令标题里的 `(Glass)` 保留。 |
| Subagent | 子智能体 | |
| Cloud / Cloud Agent | 云端 / 云端智能体 | 指 Cursor 的云端运行，不是泛指的 cloud。 |
| Worktree | 工作树 | |
| Plan | 计划 | 定价里的 Free Plan 译为「免费版」，避免和计划模式混在一起。 |
| Composer | 编写器 | Cursor 自己的功能名。 |
| Review | 审查 | |
| Pull Request | 拉取请求 | 短按钮保留 PR，例如「创建 PR」。`PR #12` 这种整句译为「拉取请求 #12」。 |
| IDE / Canvas / Markdown | 不译 | 产品或格式名。 |
| Model | 模型 | |
| Steer | 转向 | 下拉项用「转向」。说明写成「转向智能体，无需停止」「转向，不打断」。不要写成「引导」。旁边的 Interrupt 是「打断」。 |
| Plan Mode / Ask Mode / Agent Mode | 计划模式 / 提问模式 / 智能体模式 | 模式名用中文，和单独的 Plan / Ask / Agent 对齐。斜杠命令 `/plan`、`/ask` 保持原文。 |
| This Computer / This PC / On this computer | 这台计算机 | 你面前这台机器。不要写成「这台电脑」，以便和「远程计算机」用同一个名词。This Mac 保留 Mac。 |
| Remote Machine / Remote Machines | 远程计算机 | 要连上去的另一台机器。 |
| Remote Control | 远程控制 | 远程操控这台机器的功能，不是远程计算机。 |
| Computer Use | 计算机使用 | 功能名。 |
| Browser Tab / Open Browser Tab | 浏览器标签页 / 打开浏览器标签页 | 与「新建标签页」「新建浏览器标签页」同一套说法。 |
| New Output View | 新建输出视图 | 与「新建浏览器」「显示输出」对齐。Output 用「输出」。 |
| Nightly | 夜间版 | 更新通道名称。 |
| New（徽章） | 新 | 模型徽章、`.badge` / `.pill` / `cursor-badge` 上的 New 和 NEW 译为「新」。按钮上的 New 仍是「新建」。 |
| Manage Environment | 管理环境 | 侧栏悬停卡片。复数 Manage Environments 也是「管理环境」。 |

## 三层词典

- `exact.json`：整段可见文本（去掉首尾空白后）完全相等才替换。菜单、按钮、设置项标题和说明都放在这里。一句英文对应一整句中文。父节点整句能对上时，用整句译文，不再把里面的 New、Agent 这类短标签各自翻译。
- `fragments.json`：只有整段可见文本正好等于该短语时才替换。至少 8 个字符且含空格。不再把 exact 自动提升成片段，也不会改写更长句子的中间几个词。
- `regex.json`：整句锚定（`^...$`），用来处理带数字或名字的句子，例如工作时长和「26 分钟前」。

静态替换（`static-glass.json`）只改 `workbench.glass.main.js` 里的完整引号字符串，并且跳过过短、单词、含糊的字面量。命中次数按 Cursor 版本填写；对不上就整次放弃，不改文件。
