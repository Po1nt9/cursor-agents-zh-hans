# Changelog

## Unreleased

这一版是发布构建。没有在登录过的 Cursor 里看过。覆盖率没有用 acorn 或引号扫描重测。`scan --bundles glass` 仍是改这些译文之前量过的 4668 / 4928。

### 给普通用户

- Mac 上可以双击「Cursor 汉化」。不用打开终端，也不用自己安装 Node.js。Intel 和 Apple 芯片的运行环境都打在安装包里。
- 安装时如果已经有旧汉化，会先恢复再装。Cursor 开着的话，会先问一声再退出。
- 安装目录不能写时，才用系统对话框问管理员密码。
- 装好后可以选择：Cursor 更新后自动再装一次汉化，并用通知告诉你。点「恢复英文」会把这个自动安装关掉。
- 也可以用一行 `curl … | bash`。`--uninstall` 用来恢复英文。
- 打 `v*` 标签时，GitHub Actions 会把 `Cursor-zh-hans-macOS.zip` 挂到 Release 上。这个程序没有苹果签名。

### 发布译文

- 「New messages below」整句译为「下方有新消息」。删掉了只译后半句的 `messages below`，避免药丸显示成「New下面的消息」。同一句里如果还留着英文，片段规则不再只改其中一个 span。
- PR 活动时间线的动词整组译完：创建了此 PR、合并了此 PR、批准了这些更改、驳回了一条审查、指派了…、请求 bob 审查，以及标签、里程碑和重命名。
- 过口语的「关掉 / 停掉 / 在跑 / 盖掉 / 没装上 / 没有用上 / 多半」改回简洁的产品用语。安装目录那句保留 IRREVERSIBLY：不可撤消地覆盖或删除，且不会事先提示。
- 调试模式、Explore 子智能体使用的模型、截图、30 秒身份验证提示、自动同意切换模式、PR 已创建 / PR 未关闭、切换“在文件中搜索”、桌面桥接 CLI 说明（代码里的 `cursor desktop` 仍是英文）、用量分析链接、聚焦、私有推理、扩展二分查找、对话（Slack 话题除外）、导航位置，以及复核里点名的其余句子。
- 智能体窗口词典里读起来别扭的「被」改成了主动句。「进行中」、缩进，以及「权限被拒绝」「已被管理员」这类固定说法留着。

### macOS 签名

- `apply` 和 `restore` 只执行 `codesign --force --sign - --preserve-metadata=entitlements <Cursor.app>`。不再 `--deep`，不再保留 `flags` 或 `requirements`。
- 保留 hardened runtime 的 ad-hoc 主程序会在启动时被 SIGKILL（`Library not loaded: Electron Framework` / Team ID 不一致）。
- 签完再读 entitlements。若是空的，`apply` 把界面文件按备份还原并停下来，要求先重装 Cursor。不再退回到会清掉权限的签名。
- `doctor` 会指出 ad-hoc 签名上的 hardened runtime，以及主程序和 Electron Framework 的 Team ID 不一致。没有 runtime 标志时，Team ID 不同是只重签外壳之后的预期状态。
- 当前用户能写这个 `.app` 时不使用 sudo。写不了才提权。`--no-sudo` 关掉自动提权。

### 译文

- `last month` / `last year`，以及 this / next month / year。
- `Delete worktree at …` → 删除位于 … 的工作树。
- `Preview of` 后面的提及类型（File、Folder、Doc、Docs 等）译成中文；斜杠命令名仍保留。
- 用量重置和暂停句改成 `将于$1重置`，与每周用量一致。
- 英文月日时间 `Oct 17, 10:15 PM` 不再留下逗号，成为 `10月17日 22:15`。
- 热退出说明改为「将显示确认提示」；Windows 后台更新补上「在 Windows 上」；打开的编辑器；在编辑位置中后退。
- 智能体窗口词典（exact / ui / regex）里一批生硬的「进行」「由于」「被」改成更短的主动句。Microsoft `nls.json` 除上面点名的三句外没有改写。`fragments.json` 和 `static-glass.json` 没有这类句子。
