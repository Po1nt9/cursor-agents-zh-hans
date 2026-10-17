# Cursor 智能体窗口简体中文（非官方）

把 Cursor 3.x 智能体窗口（内部代号 Glass）以及经典窗口里硬编码的英文界面，补成简体中文。macOS 是主要目标，Windows 和 Linux 尽量可用。

**这是非官方项目，与 Anysphere 无关，也不是 Cursor 团队的语言包。** Cursor 服务条款限制修改、翻译和衍生作品。使用即表示你自行承担风险，包括更新后补丁失效、启动时出现「安装已损坏 / Unsupported」、以及 macOS 上需要重新签名。本仓库只发布补丁程序和我们自己写的译文，不包含 Cursor 的安装包、修改后的 Cursor 文件，或从 bundle 里抽出来的代码。它不绕过登录、授权或付费。

VS Code 原有界面请另行安装微软的中文语言包（扩展市场中的 `MS-CEINTL.vscode-language-pack-zh-hans`）。不要把那个语言包打进本仓库。

## 它做什么

Cursor 3 的智能体窗口和经典窗口加载**同一份** `workbench.html`。`workbench.js` 再根据是否为 Glass 窗口，去加载 `workbench.glass.main.js` 或 `workbench.desktop.main.js`。

`apply` 默认做两件事：

1. 在 `workbench.html` 里、`workbench.js` 之前插入一个本地脚本 `cursor-zh-hans.js`。
2. 脚本在页面里用 `MutationObserver` 翻译**新出现或刚改过**的文本，不用定时器重扫整页。查找表是 `Map`。会处理文本节点，以及 `title`、`placeholder`、`aria-label`、`aria-description`、`aria-placeholder`。

三层词典：

- 完全匹配（`dictionary/exact.json`）
- 片段（`dictionary/fragments.json`，再加上较长的完全匹配条目）
- 正则（`dictionary/regex.json`，给带数字或名字的整句用）

下面这些区域**不会**翻译：代码编辑器、终端、差异内容、聊天记录和模型输出的 Markdown、用户正在输入的内容。消息列表内部的英文也会留下来，以免把模型写的句子改掉。

可选的 `--static` 会按 `dictionary/static-glass.json` 替换 Glass 包里的引号字符串。每条规则要带上上下文锚点（需要时）和该版本的期望命中次数。次数不对就**整次放弃**，不改文件。改完会用 `node --check` 做语法检查。过短、单个、容易撞车的词（例如单独的 Agent、File、Read）不会做静态替换。

## 环境

- 已安装的 Cursor（本仓库用 3.25.6 的 Linux 包核对过路径和字符串）
- Node.js 18 或更新
- 先完全退出 Cursor。只 Reload Window 不够

## 安装

```bash
git clone <this-repo>
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
| macOS | `/Applications/Cursor.app/Contents/Resources/app`，以及 `~/Applications` 下的同名路径 |
| Windows | `%LOCALAPPDATA%\Programs\cursor\resources\app`（也会看 `Cursor` 和 Program Files） |
| Linux | `/usr/share/cursor/resources/app`、`/usr/lib/cursor/resources/app`、`/opt/Cursor/resources/app`、`~/.local/share/cursor/resources/app` |

`--app-path` 可以传 `resources/app`，也可以直接传 `Cursor.app`。AppImage 没有固定解压目录，请先解压再把里面的 `resources/app` 传给 `--app-path`。

`/Applications` 下的 Cursor 往往没有写权限。本工具不会自己调用 sudo。需要时请自行用 sudo 运行，并确认你信任当前这份代码。

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

## Cursor 更新之后

更新通常会换掉 `resources/app`，补丁和安装目录里的状态会一起消失，旧备份还在用户目录里。对新版本再执行一次 `apply` 即可：它会备份新文件，再打上补丁。

如果版本已经变了，文件里却还留着补丁标记，`apply` 会拒绝继续，避免把旧的已改文件当成新原件。先对旧版本 `restore`，或重新安装。

## macOS 签名和隔离属性

改过 `.app` 之后，原来的签名不再覆盖这些文件。Apple Silicon 上，未签名的改动可能被系统直接结束进程。

因此在 macOS 上，`apply` 和 `restore` **默认**对整个 `Cursor.app` 执行：

```bash
xattr -dr com.apple.quarantine /Applications/Cursor.app
codesign --force --deep --sign - /Applications/Cursor.app
```

这是临时的 ad-hoc 签名，不是 Apple 开发者证书。`--no-codesign` 跳过签名，`--no-clear-quarantine` 跳过隔离属性。两种都关掉时，程序只改文件，签名问题留给你自己处理。非 macOS 系统会跳过这两步，并在输出里说明。

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

1. 按钮和菜单放进 `dictionary/exact.json`。
2. 会嵌在句子里的短语放进 `dictionary/fragments.json`（至少 8 个字符，并且含空格）。
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

Quit Cursor completely, then:

```bash
node bin/cursor-zh.js apply --update-checksums
node bin/cursor-zh.js restore
```

`restore` writes back byte-for-byte backups for the current `product.json` version and commit. On macOS the default post-step is `xattr -dr com.apple.quarantine` and `codesign --force --deep --sign -` on `Cursor.app`; opt out with `--no-clear-quarantine` and `--no-codesign`. `--update-checksums` rewrites only checksum entries for files this tool actually changed. Install Microsoft's VS Code Chinese language pack from the marketplace for the inherited UI. See the Chinese sections above for paths, updates, and the glossary (`dictionary/GLOSSARY.md`).
