# 译文质量改动

对照 [dictionary/STYLE.md](../dictionary/STYLE.md)。下面先写这一轮的用词，再保留上一轮的改动记录。新加的界面句在 `dictionary/ui.json`，和 VS Code 语言包对齐的核心句仍在 `dictionary/nls.json`。

## 插话 / 排队 / 打断

「转向」读起来不像这个按钮。智能体还在工作时，三条发送选项是插话、排队、打断。

| 原文 | 旧译 | 新译 | 原因 |
| --- | --- | --- | --- |
| Steer | 转向 | 插话 | 插话是边做边补充，不必先停下来。 |
| Queue | 队列 | 排队 | 和插话、打断一样，用动作，不用名词。名词「消息队列」仍用队列。 |
| Steer the agent without stopping it | 转向智能体，无需停止 | 不打断智能体，直接补充说明 | 说明动作，不另造一个动词。 |
| Steer without interrupting | 转向，不打断 | 不打断智能体，直接补充说明 | 输入框占位和菜单说明用同一句。 |
| Send after Agent finishes | 等智能体完成后再发送 | 等智能体做完再发送 | 排队的说明。 |
| Stop the agent and send the message | 停止智能体并发送消息 | 停下智能体并发送这条消息 | 打断的说明。 |
| Messages sent while Cursor is working can steer it mid-run without interrupting - turn it on under New Messages in Agent settings | Cursor 工作时发来的消息可以中途转向，不必打断。在智能体设置的「新消息」里打开。 | Cursor 工作时发来的消息可以插话，不必打断。在智能体设置的「新消息」里打开。 | 首页提示改用插话。 |
| Steer a running agent without stopping it - set New Messages to Send Immediately in your Agents settings | 转向正在运行的智能体，无需停止。在智能体设置里把「新消息」设为「立即发送」。 | 不打断智能体，直接补充说明。在智能体设置里把「新消息」设为「立即发送」。 | 同一套说明，并带上设置路径。 |

## 第二遍：只改读起来别扭的地方

整份词典又过了一遍，按界面中文改，不逐词对译。

- 26 条 `exact.json` 和 4 条静态占位符的省略号从 `...` 改成 `…`。`另存为...`、`搜索...`、`正在提交...` 都在里面。
- 比较、导航、查找不再套「进行」：`Compare with File` 是「与文件比较」，`Navigate Between Editor Groups` 是「在编辑器组之间导航」，三条 Toggle Find 是「切换区分大小写查找 / 切换正则表达式查找 / 切换全字匹配查找」。
- `Open a browser for web interactions` 改为「打开浏览器，以便操作网页」。`You cannot summarize while the agent is still working.` 改为「智能体还在工作时无法总结。」
- 单词标签：`Details` 详情，`Preview` 预览，`Keybindings` 快捷键，`Press` 按下，`Operations` 操作，`Messaging` 消息，`Squash` 压缩提交，`Sunday` 星期日。
- 不必强调所有格的句子去掉「你的」：反馈、聊天同步、浏览器查看、每条消息的短划线、数据共享里的团队、处理请求时的错误。账户、密钥、个人资料、支出限额仍保留「你的」。
- `Close …` / `Configure …` 两条正则只匹配一个名字（`Close bash`、`Configure gmail`）。「Close All Tabs」这类整句不再被收成「关闭 All Tabs」，改为完整中文。`Grok 4.7 enabled` 仍是「Grok 4.7 已启用」。
- `Error:` 后面整句还是英文的提示，改成完整中文，例如「错误：必须提供路径」「错误：子智能体不能移动工作区根目录…」。

上一节「转向，不再用引导」是上一轮的记录。那一轮先把「引导」换成「转向」，这一轮再用「插话」换掉「转向」。

## 转向，不再用「引导」

| 原文 | 旧译 | 新译 | 原因 |
| --- | --- | --- | --- |
| Steer | 引导 | 转向 | 直译「引导」不像操作名。转向是这个按钮在做的事，和「打断」分开。 |
| Steer the agent without stopping it | 引导智能体而不停止它 | 转向智能体，无需停止 | 动词开头，去掉生硬的「引导」。 |
| Steer without interrupting | 引导而不打断 | 转向，不打断 | 和打断对举，用转向。 |
| Messages sent while Cursor is working can steer it mid-run without interrupting - turn it on under New Messages in Agent settings | Cursor 工作时发送的消息可以在运行中引导它而不打断。在智能体设置的「新消息」里打开。 | Cursor 工作时发来的消息可以中途转向，不必打断。在智能体设置的「新消息」里打开。 | 按 STYLE.md 改成更自然的界面中文。 |
| Steer a running agent without stopping it - set New Messages to Send Immediately in your Agents settings | 引导正在运行的智能体而不停止它。在智能体设置里把「新消息」设为「立即发送」。 | 转向正在运行的智能体，无需停止。在智能体设置里把「新消息」设为「立即发送」。 | 按 STYLE.md 改成更自然的界面中文。 |
| Messages sent while Cursor is working can steer it mid-run without interrupting - turn it on under New Messages in Agents settings | Cursor 工作时发送的消息可以在运行中引导它而不打断。在智能体设置的「新消息」里打开。 | Cursor 工作时发来的消息可以中途转向，不必打断。在智能体设置的「新消息」里打开。 | 按 STYLE.md 改成更自然的界面中文。 |

## 按钮不要缺宾语

| 原文 | 旧译 | 新译 | 原因 |
| --- | --- | --- | --- |
| Open MCPs | 打开 MCP | 查看 MCP | 「打开 MCP」像把协议打开。这里是去看 MCP 列表。 |
| Send Slack | 发送 Slack | 发到 Slack | 「发送 Slack」缺宾语。发到 Slack。 |
| Send Teams | 发送 Teams | 发到 Teams | 同上，发到 Teams。 |

## 去掉「按你的工作流」这种逐词说法

| 原文 | 旧译 | 新译 | 原因 |
| --- | --- | --- | --- |
| Use /create-skill to customize Cursor for your workflows | 使用 /create-skill 按你的工作流定制 Cursor | 使用 /create-skill 按工作流定制 Cursor | 按 STYLE.md 改成更自然的界面中文。 |
| Agent skills help you customize Cursor for your workflows - use /create-skill to get started | 智能体技能可以按你的工作流定制 Cursor。使用 /create-skill 开始。 | 智能体技能可以按工作流定制 Cursor。使用 /create-skill 开始。 | 按 STYLE.md 改成更自然的界面中文。 |
| Plugins help you customize Cursor for your workflows - use /add-plugin to get started | 插件可以帮助你按自己的工作流定制 Cursor。使用 /add-plugin 开始。 | 插件可以按工作流定制 Cursor。使用 /add-plugin 开始。 | 按 STYLE.md 改成更自然的界面中文。 |
| Rules give Agent persistent, system-level instructions for your coding standards and workflows. | 规则为智能体提供持久的系统级指令，用来说明你的编码标准和流程。 | 规则给智能体一套持久的系统级说明，用来约定编码标准和流程。 | 按 STYLE.md 改成更自然的界面中文。 |

## 模式名统一为提问模式

| 原文 | 旧译 | 新译 | 原因 |
| --- | --- | --- | --- |
| Ask | 询问 | 提问 | 和 Ask Mode「提问模式」用同一个词。 |

## 隐私和所有格：不必说「你的」时就去掉

| 原文 | 旧译 | 新译 | 原因 |
| --- | --- | --- | --- |
| Ask Mode uses read-only agents to research your codebase - hit shift+tab to get started | Ask 模式使用只读智能体研究你的代码库。按 shift+tab 开始。 | 提问模式用只读智能体研究代码库。按 shift+tab 开始。 | 按 STYLE.md 改成更自然的界面中文。 |
| Use /ask to research your codebase before starting code changes | 使用 /ask 在开始改代码前研究你的代码库 | 使用 /ask 在改代码前先研究代码库 | 按 STYLE.md 改成更自然的界面中文。 |
| Use /review for an agentic code review of your changes | 使用 /review 对你的更改进行智能体代码审查 | 使用 /review 对更改做智能体代码审查 | 按 STYLE.md 改成更自然的界面中文。 |
| Open your chat | 打开你的聊天 | 打开聊天 | 按 STYLE.md 改成更自然的界面中文。 |
| Start writing your plan... | 开始撰写你的计划... | 开始写计划… | 去掉多余的「你的」，省略号用中文省略号。 |
| Manage your account and billing | 管理你的账户和账单 | 管理账户和账单 | 按 STYLE.md 改成更自然的界面中文。 |
| Request an agent to review your code | 请求智能体审查你的代码 | 让智能体审查代码 | 按 STYLE.md 改成更自然的界面中文。 |
| Allow agents on this computer to be controlled from your other devices | 允许从你的其他设备控制这台计算机上的智能体 | 允许从其他设备控制这台计算机上的智能体 | 按 STYLE.md 改成更自然的界面中文。 |
| Allow cloud agents to run in your local environment. | 允许云端智能体在你的本地环境中运行。 | 允许云端智能体在本地环境中运行。 | 按 STYLE.md 改成更自然的界面中文。 |
| Automatically index repositories to speed up Grep searches. All data is stored locally. Managed by your organization. | 自动索引仓库以加快 Grep 搜索。所有数据都存储在本地。由你的组织管理。 | 自动索引仓库，加快 Grep 搜索。数据都存在本地，由组织管理。 | 按 STYLE.md 改成更自然的界面中文。 |
| Cursor syncs your local skills so they can be used with Cloud Agents. Turn this off to disable syncing. | Cursor 会同步你的本地技能，供云端智能体使用。关闭此项即停止同步。 | Cursor 会同步本地技能，供云端智能体使用。关闭后停止同步。 | 按 STYLE.md 改成更自然的界面中文。 |
| Create an Origin namespace to save and publish your work easily | 创建一个 Origin 命名空间，方便保存和发布你的工作 | 创建 Origin 命名空间，方便保存和发布工作 | 按 STYLE.md 改成更自然的界面中文。 |
| Partially mask your email address in the Cursor user interface | 在 Cursor 界面中部分遮盖你的电子邮件地址 | 在 Cursor 界面中部分隐藏电子邮件地址 | 按 STYLE.md 改成更自然的界面中文。 |
| Plugins give your agents important context | 插件为你的智能体提供重要上下文 | 插件为智能体提供重要上下文 | 按 STYLE.md 改成更自然的界面中文。 |
| Run it from your Cursor account | 从你的 Cursor 账户运行 | 用 Cursor 账户运行 | 按 STYLE.md 改成更自然的界面中文。 |
| Use your skills with Cloud Agents | 在云端智能体中使用你的技能 | 在云端智能体中使用这些技能 | 按 STYLE.md 改成更自然的界面中文。 |
| Save your changes to a stash and restore them later | 将更改保存到贮藏中，以便稍后还原 | 把更改贮藏起来，以后再还原 | 按 STYLE.md 改成更自然的界面中文。 |
| Stash and save your changes so you can restore them later | 贮藏并保存更改，以便稍后还原 | 贮藏并保存更改，以后再还原 | 按 STYLE.md 改成更自然的界面中文。 |
| Included usage with your subscription. | 订阅包含的用量。 | 订阅内含用量。 | 整句改成订阅内含用量，避免和后面的日期各译一半。 |
| Included usage with your subscription. Used before your credits. | 订阅包含的用量。会在额度之前消耗。 | 订阅内含用量，优先于额度扣除。 | 整句说明先扣订阅用量。 |
| Voice mode lets you dictate better prompts for your agents | 语音模式可以让你口述出更好的智能体提示 | 语音模式方便口述出更好的智能体提示 | 去掉「可以让你」这种逐词结构。 |
| Claim a handle for your public profile page | 为公开个人资料页设置用户名 | 为公开资料页设置用户名 | 按 STYLE.md 改成更自然的界面中文。 |
| Configure AWS Bedrock to use Anthropic Claude models through your AWS account. | 配置 AWS Bedrock，通过你的 AWS 账户使用 Anthropic Claude 模型。 | 配置 AWS Bedrock，通过自己的 AWS 账户使用 Anthropic Claude 模型。 | 按 STYLE.md 改成更自然的界面中文。 |
| Configure Azure OpenAI to use OpenAI models through your Azure account. | 配置 Azure OpenAI，通过你的 Azure 账户使用 OpenAI 模型。 | 配置 Azure OpenAI，通过自己的 Azure 账户使用 OpenAI 模型。 | 按 STYLE.md 改成更自然的界面中文。 |
| When enabled, your cursor.com profile page is visible to anyone with the link. | 开启后，任何拥有链接的人都可以看到你的 cursor.com 个人资料页。 | 开启后，拿到链接的人都能看到这份 cursor.com 个人资料页。 | 按 STYLE.md 改成更自然的界面中文。 |
| Your code data will not be trained on or used to improve the product. Code may be stored to provide features such as Background Agent. | 你的代码数据不会被用于训练或改进产品。为了提供后台智能体等功能，代码可能会被存储。 | 代码数据不会用于训练或改进产品。为了提供后台智能体等功能，代码可能会被保存。 | 按 STYLE.md 改成更自然的界面中文。 |
| Your code data will not be trained on or used to improve the product. We will not store your code. | 你的代码数据不会被用于训练或改进产品。我们不会存储你的代码。 | 代码数据不会用于训练或改进产品，也不会被保存。 | 按 STYLE.md 改成更自然的界面中文。 |
| Your codebase, prompts, edits and other usage data will be stored and trained on by Cursor to improve the product. | 你的代码库、提示、编辑和其他使用数据会被 Cursor 存储并用于训练，以改进产品。 | 代码库、提示、编辑和其他使用数据会被 Cursor 保存并用于训练，以改进产品。 | 按 STYLE.md 改成更自然的界面中文。 |
| Your codebase, prompts, edits and other usage data will be stored and trained on by Cursor to improve the product. Prompts and limited telemetry may also be shared with model providers when you explicitly select their models. | 你的代码库、提示、编辑和其他使用数据会被 Cursor 存储并用于训练，以改进产品。当你明确选择模型提供方时，提示和有限的遥测数据也可能分享给它们。 | 代码库、提示、编辑和其他使用数据会被 Cursor 保存并用于训练，以改进产品。明确选择模型提供方时，提示和有限的遥测数据也可能分享给它们。 | 按 STYLE.md 改成更自然的界面中文。 |
| Your prompts, edits and other usage data will be stored and trained on by Cursor to improve the product. | 你的提示、编辑和其他使用数据会被 Cursor 存储并用于训练，以改进产品。 | 提示、编辑和其他使用数据会被 Cursor 保存并用于训练，以改进产品。 | 按 STYLE.md 改成更自然的界面中文。 |
| Your prompts, edits and other usage data will be stored and trained on by Cursor to improve the product. Prompts and limited telemetry may also be shared with model providers when you explicitly select their models. | 你的提示、编辑和其他使用数据会被 Cursor 存储并用于训练，以改进产品。当你明确选择模型提供方时，提示和有限的遥测数据也可能分享给它们。 | 提示、编辑和其他使用数据会被 Cursor 保存并用于训练，以改进产品。明确选择模型提供方时，提示和有限的遥测数据也可能分享给它们。 | 按 STYLE.md 改成更自然的界面中文。 |
| Enter your API key | 输入你的 API 密钥 | 输入 API 密钥 | 按 STYLE.md 改成更自然的界面中文。 |

## 更像产品界面，而不是逐词翻译

| 原文 | 旧译 | 新译 | 原因 |
| --- | --- | --- | --- |
| Enable language server by default to provide code intelligence in agent worktree workspaces | 默认启用语言服务器，以便在智能体工作树工作区中提供代码智能 | 默认启用语言服务器，在智能体工作树里提供代码智能 | 按 STYLE.md 改成更自然的界面中文。 |
| Enable language server by default to provide code intelligence in workspaces | 默认启用语言服务器，以便在工作区中提供代码智能 | 默认启用语言服务器，在工作区里提供代码智能 | 按 STYLE.md 改成更自然的界面中文。 |
| Subagents are specialized assistants that run in their own context window so Agent can parallelize and stay focused. | 子智能体是在各自的上下文窗口中运行的专用助手，以便智能体并行处理并保持专注。 | 子智能体在各自的上下文窗口里运行，方便智能体并行处理并保持专注。 | 按 STYLE.md 改成更自然的界面中文。 |
| Use /cloud to run agents remotely for better parallelization and durable execution | 使用 /cloud 在远程运行智能体，以便更好地并行并持久执行 | 使用 /cloud 在远程运行智能体，并行更好，执行也更持久 | 按 STYLE.md 改成更自然的界面中文。 |
| Security checks on every change. | 每次更改都进行安全检查。 | 每次更改都做安全检查。 | 按 STYLE.md 改成更自然的界面中文。 |
| Skip approval dialog; Agent may run web searches automatically | 跳过批准对话框；智能体可能会自动进行网页搜索 | 跳过批准对话框；智能体可能会自动搜索网页 | 按 STYLE.md 改成更自然的界面中文。 |

## 截图里还是英文的整句

| 原文 | 旧译 | 新译 | 原因 |
| --- | --- | --- | --- |
| Unable to resolve your shell environment in a reasonable time. Please review your shell configuration and restart. | （原来没有） | 无法在合理的时间内解析 shell 环境。请检查 shell 配置，然后重新启动。 | 菜单、提示、设备和更新通道上的原文。 |
| Restart | （原来没有） | 重新启动 | 菜单、提示、设备和更新通道上的原文。 |
| Create Profile | （原来没有） | 创建配置文件 | 菜单、提示、设备和更新通道上的原文。 |
| Get Cursor for iOS | （原来没有） | 获取 iOS 版 Cursor | 菜单、提示、设备和更新通道上的原文。 |
| Shortcuts | （原来没有） | 快捷键 | 菜单、提示、设备和更新通道上的原文。 |
| Contact Us | （原来没有） | 联系我们 | 菜单、提示、设备和更新通道上的原文。 |
| Paired Devices | （原来没有） | 已配对设备 | 菜单、提示、设备和更新通道上的原文。 |
| No devices are currently paired with this computer. | （原来没有） | 这台计算机当前没有已配对的设备。 | 菜单、提示、设备和更新通道上的原文。 |
| Unnamed device | （原来没有） | 未命名设备 | 菜单、提示、设备和更新通道上的原文。 |
| It won't be able to control this computer until it's authorized here again. | （原来没有） | 在这里再次授权之前，它不能再控制这台计算机。 | 菜单、提示、设备和更新通道上的原文。 |
| It won’t be able to control this computer until it’s authorized here again. | （原来没有） | 在这里再次授权之前，它不能再控制这台计算机。 | 菜单、提示、设备和更新通道上的原文。 |
| ⚠️ Warning: Updates Apply Automatically | （原来没有） | ⚠️ 警告：更新会自动安装 | 菜单、提示、设备和更新通道上的原文。 |
| This track will silently download and install updates without prompting whenever Cursor is closed. | （原来没有） | 选择此通道后，只要 Cursor 处于关闭状态，就会在不提示的情况下下载并安装更新。 | 菜单、提示、设备和更新通道上的原文。 |
| Used before your credits. | （原来没有） | 优先于额度扣除。 | 菜单、提示、设备和更新通道上的原文。 |
| Used before your credits | （原来没有） | 优先于额度扣除 | 菜单、提示、设备和更新通道上的原文。 |
| Ctrl+Enter submits chat, Enter inserts a newline, and primary actions move to Ctrl+Alt+Enter | Ctrl+Enter 提交聊天，Enter 插入换行，主要操作改为 Ctrl+Alt+Enter | Ctrl+Enter 提交聊天，Enter 换行，主要操作改为 Ctrl+Alt+Enter | 整段翻译，避免只替换其中一个词。 |
| ⌘Enter submits chat, Enter inserts a newline, and primary actions move to ⌥⌘Enter | （原来没有） | ⌘Enter 提交聊天，Enter 换行，主要操作改为 ⌥⌘Enter | 菜单、提示、设备和更新通道上的原文。 |
| Submit with ⌘ + Enter | （原来没有） | 使用 ⌘ + Enter 提交 | 菜单、提示、设备和更新通道上的原文。 |

## 用量整句不再被正则截断

`Included usage ... Resets {date}. Used before your credits.` 以前会被较短的 `.+` 吞掉后半句，变成「将于 10月24日. Used before your credits 重置」。日期捕获改成不含句号，整句译为「订阅内含用量，{date}重置，优先于额度扣除。」单独的 `8% used` 译为「已用 8%」。

## 模式名

Plan Mode、Ask Mode、Agent Mode 用计划模式、提问模式、智能体模式。单独的 Ask 从「询问」改为「提问」。斜杠命令保持英文。

## 官方语言包

`dictionary/nls.json` 和 `dictionary/nls-regex.json` 里是 VS Code 核心错误、通知和对话框，按英文原文对齐 [vscode-loc](https://github.com/microsoft/vscode-loc) 的 `main.i18n.json`（MIT，Microsoft）。已有 Glass 词条不覆盖。导入时把「您」改成「你」，并把汉字旁的半角标点改成全角。

## 云端环境进度和失败

准备环境、创建云端工作区、拉取镜像、打开拉取请求这些整句补进了 `exact.json`。内部 SDK 日志（Statsig、disposable、xhr）留在英文。
