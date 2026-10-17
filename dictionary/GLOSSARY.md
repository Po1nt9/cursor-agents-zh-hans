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
| Account | 帐户 |
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

## 三层词典

- `exact.json`：整段可见文本（去掉首尾空白后）完全相等才替换。菜单和按钮上的短词只放在这里。
- `fragments.json`：出现在更长句子里的短语。至少 8 个字符且含空格。另外，exact 里不少于 16 个字符、含空格的条目会自动当作片段，长的优先。
- `regex.json`：整句锚定（`^...$`），用来处理带数字或名字的句子。

静态替换（`static-glass.json`）只改 `workbench.glass.main.js` 里的完整引号字符串，并且跳过过短、单词、含糊的字面量。命中次数按 Cursor 版本填写；对不上就整次放弃，不改文件。
