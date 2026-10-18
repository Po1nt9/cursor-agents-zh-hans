# Cursor 智能体窗口简体中文（非官方）

把 Cursor 的智能体窗口改成简体中文。Mac 上不用打开终端。

**这是非官方项目，与 Anysphere 无关，也不是 Cursor 团队的语言包。**

屏幕最上面的菜单栏，请另外在扩展市场安装微软的中文语言包 `MS-CEINTL.vscode-language-pack-zh-hans`。

## 三步装上

Intel 和 Apple 芯片都可以。Cursor 可以在「应用程序」、家里的 Applications，或其他文件夹里。

1. **下载并解压** [最新版本](https://github.com/Po1nt9/cursor-agents-zh-hans/releases/latest) 里的 `Cursor-zh-hans-macOS.zip`。发布页如果是空的，安装包还没挂上，等 v0.1.0。
2. **拖进「应用程序」**。把「Cursor 汉化」拖到「应用程序」文件夹，不要从「下载」里直接打开。
3. **双击，点「安装」**。从「应用程序」里打开「Cursor 汉化」，点「安装汉化」。Cursor 如果开着，按提示退出。装好后会自己重新打开。

装好时如果问要不要在 Cursor 更新后自动再装一次，选「要」即可。

如果钥匙串弹出「Cursor Safe Storage」，点「始终允许」。

Cursor 服务条款限制修改、翻译和衍生作品。使用即表示你自行承担风险，包括更新后补丁失效、启动时出现「安装已损坏 / Unsupported」、以及 macOS 上需要重新签名。本仓库只发布补丁程序和我们自己写的译文，不包含 Cursor 的安装包、修改后的 Cursor 文件，或从 bundle 里抽出来的代码。它不绕过登录、授权或付费。

## 第一次如果提示「无法打开」

这个小工具没有苹果签名。系统拦住是正常的，不是病毒。

- **macOS 15 及以后**：只能走这一条。先双击一次（会被拦住），然后打开「系统设置 → 隐私与安全性」，滑到最下面，点「仍要打开」，再输入开机密码。这一版不能靠右键「打开」绕过。
- **macOS 14 及更早**：在「Cursor 汉化」上按住 Control 再点（或右键），选「打开」，再点「打开」。

第一次这样打开之后，以后可以直接双击。不想跟这个提示打交道，用下面的一行命令。

## 用一行命令安装

不想跟「无法打开」打交道，可以把下面这一行粘贴到「终端」。不需要安装 git 或 Node.js，也不会弹出那个提示。

```bash
curl -fsSL https://raw.githubusercontent.com/Po1nt9/cursor-agents-zh-hans/main/install.sh | bash
```

程序会放到你的「个人应用程序」文件夹（家里的 Applications），然后打开同样的窗口。

恢复英文：

```bash
curl -fsSL https://raw.githubusercontent.com/Po1nt9/cursor-agents-zh-hans/main/install.sh | bash -s -- --uninstall
```

## 怎么变回英文

再双击「Cursor 汉化」，点「恢复英文」。自动重新安装会一起关掉。

## 常见问题

### Cursor 更新后变回英文怎么办

更新会换掉界面文件，汉化会跟着消失。如果安装时选了自动重新安装，等 Cursor 退出后会自己装上，并给你一条通知。当时 Cursor 还开着的话，先完全退出，过一会儿再看。

没有选自动安装的话，再双击「Cursor 汉化」，点一次「安装汉化」。

汉化程序本身有新版本时，重新下载压缩包，再点一次安装。

### 钥匙串弹窗

重做签名之后，钥匙串可能问是否允许访问「Cursor Safe Storage」。点「始终允许」。点不允许的话，Cursor 会像退出了登录。麦克风或摄像头如果再问一次，按你自己的需要选。

### 提示「无法打开」

看上面的「第一次如果提示无法打开」。macOS 15 及以后用「系统设置 → 隐私与安全性 → 仍要打开」。macOS 14 及更早可以右键选「打开」。也可以改用上面的一行命令。

### 怎么卸载

再打开「Cursor 汉化」，点「恢复英文」。或者用上面带 `--uninstall` 的那一行命令。

安装没有成功时，窗口里可以点「复制详细信息」。完整记录在 `~/Library/Logs/cursor-zh-hans.log`。如果提示系统权限是空的，请到 [cursor.com](https://cursor.com) 重新安装 Cursor，然后再打开「Cursor 汉化」点一次「安装汉化」。

## Windows 和 Linux

命令行方式仍然可用，见下面的「开发者」。Windows 上如果已经装了 Node.js 18 或更新版本，可以在完全退出 Cursor 之后运行仓库里的 `install.ps1`（加 `-Uninstall` 则恢复英文）。Mac 不需要这个文件。

## 开发者

下面是给维护和命令行用的。普通安装看上面即可。

打包双击程序（在 Linux 上即可，不必有 Mac）：

```bash
bash packaging/macos/build-app.sh
```

产物是 `dist/Cursor-zh-hans-macOS.zip`。里面是手写的 `Cursor 汉化.app`（`Info.plist` 加 shell 启动器），并带有官方 Node.js 的 arm64 与 x64。`bash packaging/macos/build-app.sh --stub` 不下载 Node，只用来检查压缩包结构。打 `v*` 标签或手动跑 `.github/workflows/release.yml` 时，会构建同一个 zip；只有标签会挂到 GitHub Release。

启动器按 `uname -m` 选择 Node。找 Cursor 时用 Spotlight `mdfind kMDItemCFBundleIdentifier == 'com.todesktop.230313mzl4w4u92'`，再加上 `/Applications`、`~/Applications` 和下面一层子目录。找到 0 个或多于 1 个时弹出选择文件。只有 `.app` 不可写时，才用 `osascript … with administrator privileges` 提权，并带上原来的 `SUDO_USER`。安装结束时把当前架构的 Node、监视脚本和补丁复制到 `~/Library/Application Support/cursor-zh-hans/runtime/`，再写入用户 LaunchAgent `com.po1nt9.cursor-zh-hans.watch`。Agent 指向这些副本，不指向「Cursor 汉化.app」里面。它监视 Cursor 的 `product.json`，并每隔 15 分钟再看一次（整包替换时 WatchPaths 不一定响）。Cursor 没在运行时静默再执行 `apply --update-checksums`。点「恢复英文」会删掉这个 Agent、支持文件夹和锁文件。

## 它做什么

Cursor 3 的智能体窗口和经典窗口加载**同一份** `workbench.html`。`workbench.js` 再根据是否为 Glass 窗口，去加载 `workbench.glass.main.js` 或 `workbench.desktop.main.js`。

`apply` 默认做两件事：

1. 在 `workbench.html` 里、`workbench.js` 之前插入一个本地脚本 `cursor-zh-hans.js`。
2. 脚本在页面里用 `MutationObserver` 记录变更。第一次扫整页文档用 `requestIdleCallback`（超时约 50ms，没有则用 `setTimeout`）。小批量新节点（约 1500 个节点或 8ms 以内）在观察者回调里同步翻译，从设置回到主页时不必先画一帧英文；更大的批次仍用 `setTimeout(0)`。`window.__cursorZhHans.report()` 会列出仍含英文的文本和占位符，并说明原因（跳过、词表没有、已锁住或预算用完）。`report({visibleOnly:true})` 会跳过 `display:none`、`visibility:hidden`，也会跳过零尺寸节点自己的文字；零尺寸包装里面如果还有可见菜单，仍会走进去。开放的 shadow root，以及挂在 `documentElement` 上、不在 `body` 里的弹出层，观察者和报告都会走到。编写器占位符已由注入样式覆盖时，报告不再把它们记成跳过。首页提示如果每个词各占一个 span，会先拼成整句再翻译。查找表是 `Map`。正则按首字符分桶。会处理文本节点，以及普通控件上的 `title`、`placeholder`、`aria-label`、`aria-description`、`aria-placeholder`。编写器（`contenteditable`、`.ProseMirror`、`.tiptap`）里面不写入文字，也不写入 `placeholder`、`data-placeholder`、`aria-placeholder`。编写器上的其他标签（例如 `aria-label` 的 Prompt）仍会翻译。空编写器的占位符仍由 CSS `content: attr(data-placeholder)` 显示，补丁另注入样式，按原文精确覆盖 `::before` / `::after`。输入框自己的 `placeholder` 会翻译，已经键入的文字不会。`window.__cursorZhHans.disconnect()` 可以关掉观察者并撤掉这段样式。

三层词典：

- 完全匹配（`dictionary/exact.json`）：整段可见文字去掉首尾空白后必须完全相等，设置页的标题和说明都走这里
- 片段（`dictionary/fragments.json`）：只有整段文字正好等于这条短语时才替换。同一句里如果旁边还留着英文，不会只改其中一个 span，以免出现「New下面的消息」
- 正则（`dictionary/regex.json`，给带数字或名字的整句用，例如「工作了 2 分 15 秒」「26 分钟前」）

下面这些区域**不会**翻译：代码编辑器、终端、差异内容、聊天记录和模型输出的 Markdown、用户正在输入的内容。消息列表内部的英文也会留下来，以免把模型写的句子改掉。

可选的 `--static` 会按 `dictionary/static-glass.json` 替换 Glass 包里的引号字符串。每条规则要带上上下文锚点（需要时）和该版本的期望命中次数。次数不对就**整次放弃**，不改文件。改完会用 `node --check` 做语法检查。过短、单个、容易撞车的词（例如单独的 Agent、File、Read）不会做静态替换。

## 环境

- 已安装的 Cursor（本仓库用 3.25.6 的 Linux 包核对过路径和字符串）
- Node.js 18 或更新
- 先完全退出 Cursor。只 Reload Window 不够

## 安装

```bash
git clone https://github.com/Po1nt9/cursor-agents-zh-hans
cd cursor-agents-zh-hans
node --test
```

不需要 `npm install`。命令是：

```bash
node bin/cursor-zh.js <command>
```

也可以 `npm link` 之后用 `cursor-zh`。

## 用法

先看安装是否被认出来：

```bash
node bin/cursor-zh.js doctor
```

macOS 上推荐：

```bash
node bin/cursor-zh.js apply --update-checksums
```

只翻译运行时能看到的字、不改校验和：

```bash
node bin/cursor-zh.js apply
```

同时改 Glass 包里注入到不了的字符串（3.25.6 上这些规则有命中次数；别的版本会跳过没有次数的规则）：

```bash
node bin/cursor-zh.js apply --static --update-checksums
```

安装目录会自动找：

| 系统 | 默认位置 |
| --- | --- |
| macOS | `/Applications/Cursor.app`，以及 `/Applications/子目录/Cursor.app`、`~/Applications` 下同样的两级路径。若能从正在运行的进程命令行看出安装位置，优先用那个路径 |
| Windows | `%LOCALAPPDATA%\Programs\cursor\resources\app`（也会看 `Cursor` 和 Program Files） |
| Linux | `/usr/share/cursor/resources/app`、`/usr/lib/cursor/resources/app`、`/opt/Cursor/resources/app`、`~/.local/share/cursor/resources/app` |

`--app-path` 可以传 `resources/app`，也可以直接传 `Cursor.app`。不在默认位置时要自己带上，例如装在 `/Applications/Agent/Cursor.app`：

```bash
node bin/cursor-zh.js apply --app-path /Applications/Agent/Cursor.app --update-checksums
node bin/cursor-zh.js restore --app-path /Applications/Agent/Cursor.app
```

AppImage 没有固定解压目录，请先解压再把里面的 `resources/app` 传给 `--app-path`。

先看 `doctor` 里的「可写」。当前用户能写这个 `.app` 时，直接 `apply`，不要加 sudo。只有写不了安装目录时，`apply` / `restore` 才会自己用 sudo 提权。不想自动提权就加 `--no-sudo`。用 sudo 时，备份目录跟发起命令的用户走（看 `SUDO_USER`），不会写到 `/var/root`。也可以自己传 `--data-dir`。

## 还原

```bash
node bin/cursor-zh.js restore
```

还原会把**当前这个 Cursor 版本 + commit** 的备份原样写回去，并删掉注入的脚本和状态文件。备份在打补丁之前写入，按 `版本+product.json 里的 commit` 分开存放，默认位置是：

- macOS：`~/Library/Application Support/cursor-zh-hans/backups/`
- Linux：`~/.local/share/cursor-zh-hans/backups/`
- Windows：`%APPDATA%\cursor-zh-hans\backups\`

写回之后，被备份过的文件与打补丁前字节相同。若还执行过校验和更新，`product.json` 也会回到备份。语言包扩展不在此列，不受影响。

找不到当前版本的备份时，命令会停下来，不会拿旧版本的文件覆盖新安装。那种情况要回到干净的界面，请重新安装 Cursor。

如果启动时被系统杀掉（退出码 137 / SIGKILL），控制台里是 `Library not loaded: @rpath/Electron Framework.framework/Electron Framework` 或 `different Team IDs`，多半是旧版补丁用 `codesign --deep --preserve-metadata=entitlements,requirements,flags` 重签过。ad-hoc 主程序带着 hardened runtime，会拒绝仍由 Developer ID 签名的 Electron Framework。`doctor` 会指出这种签名。用这一版重新 `apply`；如果它提示没有 entitlements，先重新安装 Cursor，再 `apply`。

## 实机验证

已在 Linux 上用登录后的 Cursor 3.25.6 看过智能体窗口。macOS 签名由单元测试覆盖。

第一次安装直接 `apply --update-checksums`，不要加 `--static`。如果以前装过旧版补丁，先 `restore`，再 `apply`。不在默认位置时带上路径：

```bash
node bin/cursor-zh.js apply --app-path /Applications/Agent/Cursor.app --update-checksums
```

如果 `doctor` 说 entitlements 是空的，先重装 Cursor，再打补丁。

## 译文从哪来

界面语气见 [dictionary/STYLE.md](dictionary/STYLE.md)，术语见 [dictionary/GLOSSARY.md](dictionary/GLOSSARY.md)。

错误、通知和对话框里来自 VS Code 核心的英文，按原文去对 [vscode-loc](https://github.com/microsoft/vscode-loc) 的 `i18n/vscode-language-pack-zh-hans/translations/main.i18n.json`。那份语言包是 MIT 许可，版权归 Microsoft。本仓库只收录对得上的简体中文，并改成「你」和全角标点。编辑器本体和屏幕顶部的 macOS 菜单仍请安装 `MS-CEINTL.vscode-language-pack-zh-hans`。

## 反馈还没译的字

界面上还剩英文时，在那个窗口打开开发者工具（Help → Toggle Developer Tools），在 Console 里执行：

```js
copy(JSON.stringify(window.__cursorZhHans.report({ visibleOnly: true }), null, 2))
```

`copy` 会把结果放进剪贴板。不传 `visibleOnly` 时会连隐藏节点一起列。每条有原文、大致路径，以及原因：`skipped`（哪条规则）、`no dictionary match`、`latched` 或 `budget`。把这份 JSON 连同 Cursor 版本发回来即可。`window.__cursorZhHans.disconnect()` 可以关掉翻译。

## Cursor 更新之后

更新通常会换掉 `resources/app`，补丁和安装目录里的状态会一起消失，旧备份还在用户目录里。对新版本再执行一次 `apply` 即可：它会备份新文件，再打上补丁。

如果版本已经变了，文件里却还留着补丁标记，`apply` 会拒绝继续，避免把旧的已改文件当成新原件。先对旧版本 `restore`，或重新安装。

## macOS 签名和隔离属性

改过 `.app` 之后，原来的签名不再覆盖这些文件。Apple Silicon 上，未签名的改动可能被系统直接结束进程。

因此在 macOS 上，`apply` 和 `restore` **默认**对整个 `Cursor.app` 执行：

```bash
xattr -dr com.apple.quarantine /Applications/Cursor.app
codesign --force --sign - --preserve-metadata=entitlements /Applications/Cursor.app
```

这是临时的 ad-hoc 签名，不是 Apple 开发者证书。原来的 Developer ID 签名会被换掉；要回到官方签名，重新安装 Cursor。命令只保留 entitlements（allow-jit、摄像头、麦克风、Apple Events）。不要加 `--deep`，也不要保留 `flags` 或 `requirements`。`flags` 里的 hardened runtime 留在 ad-hoc 主程序上时，库校验会拒绝 Electron Framework，Cursor 启动即被 SIGKILL。`--deep` 还会去重签里面的 framework，没有必要。

签完会再读一次 entitlements。如果是空的，`apply` 会把界面文件按备份还原，并停下来。空权限无法靠再签一次找回来，只能重装 Cursor。不会退回到「什么元数据都不保留」的签名。

2026-10-17 当天的第一版曾经把 entitlements 清成空的。那种安装即使用现在的命令，也没有东西可以保留。请先重新安装 Cursor，再打补丁。`doctor` 会写出这件事，也会检查 ad-hoc 签名是否仍带着 hardened runtime，以及主程序和 Electron Framework 的 Team ID 是否不一致。

`--no-codesign` 跳过签名，`--no-clear-quarantine` 跳过隔离属性。两种都关掉时，程序只改文件，签名问题留给你自己处理。非 macOS 系统会跳过这两步，并在输出里说明。

## macOS 注意事项

重签名之后，钥匙串可能会询问是否允许访问「Cursor Safe Storage」。请允许。拒绝的话，Cursor 会看起来像退出了登录。

麦克风、摄像头和自动化权限可能会再问一次。

Cursor 自动更新可能失败，也可能盖掉这个补丁。更新 Cursor 之后再执行一次 `apply`。如果更新失败，先重新安装 Cursor，再 `apply`。

屏幕顶部的 macOS 菜单栏是系统原生菜单，不在网页 DOM 里，这个补丁改不到。请从扩展市场安装 `MS-CEINTL.vscode-language-pack-zh-hans`。设置页、侧边栏、主页建议和占位符走的是 DOM，由本词典翻译。

## 校验和

`product.json` 的 `checksums` 是文件的 SHA-256，标准 base64，去掉末尾的 `=`。在 3.25.6 里一共 6 项。`workbench.html` 和 `workbench.desktop.main.js` **在**列表里；`workbench.glass.main.js` **不在**。

所以只改 HTML 注入，启动时就可能提示安装已损坏。这和登录、付费无关。

`--update-checksums` 才会改 `product.json`，而且只重写本次真的改过、并且本来就在列表里的那几项，其它校验和原样保留。不传这个参数时，校验和文件不会被碰。`doctor` 会告诉你 HTML 和记录是否一致。

## 维护译文

```bash
node bin/cursor-zh.js scan --app-path /path/to/resources/app --limit 200
```

`scan` 从本机的 Glass / 经典窗口包里抽出看起来像界面文案的英文字符串，和词典比对，列出还没翻译的，以及静态规则的命中次数是否还对。输出是字符串列表。不要把 Cursor 的 bundle、`scan` 结果里的大段代码、或打过补丁的安装目录提交进仓库。

改译文时：

1. 按钮、菜单、设置项的标题和整句说明放进 `dictionary/exact.json`。一句英文就给一整句中文，不要只译句子里的一两个词。
2. `dictionary/fragments.json` 只保留整段可见文字正好等于该短语的情况（至少 8 个字符，并且含空格）。它不再改写更长句子的中间部分，以免出现「云端智能体 Approval Banners」这种中英混排。
3. 带数字或名字的整句放进 `dictionary/regex.json`，模式必须是 `^...$`。
4. 注入到不了、又足够长的 Glass 字符串，才加进 `dictionary/static-glass.json`，并写上该版本的 `expectedHits`。
5. 用词跟 [dictionary/GLOSSARY.md](dictionary/GLOSSARY.md) 保持一致。Agent 用「智能体」，不用「代理」。
6. 跑 `node --test`。

`status` 看当前有没有补丁。`doctor` 还会打印校验和列表、进程是否还在、以及 macOS 签名说明。

## 测试

```bash
node --test
```

测试使用临时的假安装目录，不读取真实的 Cursor 文件。

## English

Unofficial Simplified Chinese patcher for Cursor's Agents Window (Glass) and the hardcoded Cursor strings in the classic window. Not affiliated with Anysphere. Cursor's terms restrict modification and derivative works; use at your own risk. This repo ships only the patcher and our translations. It does not bypass sign-in or billing.

On a Mac, download `Cursor-zh-hans-macOS.zip` from the latest release, unzip it, drag 「Cursor 汉化」 into Applications, then double-click it and choose 安装. The app is unsigned. On macOS 15 and later the only bypass is System Settings → Privacy & Security → Open Anyway after a blocked double-click. On macOS 14 and earlier, Control-click → Open still works. A terminal alternative that does not show that warning:

```bash
curl -fsSL https://raw.githubusercontent.com/Po1nt9/cursor-agents-zh-hans/main/install.sh | bash
curl -fsSL https://raw.githubusercontent.com/Po1nt9/cursor-agents-zh-hans/main/install.sh | bash -s -- --uninstall
```

The command-line tool still works. Quit Cursor completely, then:

```bash
node bin/cursor-zh.js apply --update-checksums
node bin/cursor-zh.js restore
```

`restore` writes back byte-for-byte backups for the current `product.json` version and commit. On macOS the default post-step is `xattr -dr com.apple.quarantine` and `codesign --force --sign - --preserve-metadata=entitlements` on `Cursor.app` (no `--deep`, and no `flags` or `requirements`). Keeping hardened runtime on that ad-hoc main binary makes launch die with SIGKILL 137 (`Library not loaded: Electron Framework` / different Team IDs). The tool checks entitlements after signing and, if they are empty, restores the UI files and tells you to reinstall Cursor. It does not fall back to a signature that drops them. sudo runs only when the `.app` is not writable by the current user; a writable install, including `/Applications/Agent/Cursor.app` when you own it, stays unprivileged. `--no-sudo` turns that off. Opt out of signing with `--no-clear-quarantine` and `--no-codesign`. Auto-detect also checks `/Applications/*/Cursor.app`, `~/Applications/*/Cursor.app`, and the running process command line when it contains a path. `--update-checksums` rewrites only checksum entries for files this tool actually changed. The native macOS menu bar is outside the DOM; install Microsoft's VS Code Chinese language pack (`MS-CEINTL.vscode-language-pack-zh-hans`) for it. See the Chinese sections above for paths, updates, and the glossary (`dictionary/GLOSSARY.md`).
