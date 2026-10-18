# Changelog

## Unreleased

这一版没有在登录过的 Cursor 里看过。覆盖率没有用 acorn 或引号扫描重测。`scan --bundles glass` 在 3.25.6 的 Glass 包上是 4668 / 4928。

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
