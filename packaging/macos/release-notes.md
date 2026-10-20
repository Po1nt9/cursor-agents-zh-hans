这是给 Mac 用的双击安装包。不用打开终端，也不用另外安装软件。Intel 和 Apple 芯片都可以。

## 怎么安装

1. 下载下面的 `Cursor-zh-hans-macOS.zip`，双击解压
2. 把「Cursor 汉化」拖进「应用程序」，不要从「下载」里直接打开
3. 从「应用程序」里双击「Cursor 汉化」，点「安装汉化」

Cursor 如果开着，按提示退出。装好后会自己重新打开。

如果钥匙串弹出「Cursor Safe Storage」，点「始终允许」。

## 第一次打开如果提示「无法打开」

这个程序没有苹果签名。系统拦住是正常的，不是病毒。

- **macOS 15 及以后**：先双击一次（会被拦住），然后打开「系统设置 → 隐私与安全性」，滑到最下面，点「仍要打开」。不能靠右键「打开」绕过。
- **macOS 14 及更早**：在「Cursor 汉化」上按住 Control 再点（或右键），选「打开」，再点「打开」

不想看到这个提示，可以在「终端」里粘贴下面这一行（不会弹出无法打开）：

```bash
curl -fsSL https://raw.githubusercontent.com/Po1nt9/cursor-agents-zh-hans/main/install.sh | bash
```

恢复英文：

```bash
curl -fsSL https://raw.githubusercontent.com/Po1nt9/cursor-agents-zh-hans/main/install.sh | bash -s -- --uninstall
```

## 怎么变回英文

再打开「Cursor 汉化」，点「恢复英文」。自动重新安装会先关掉，确认界面已经回到英文之后才删掉这份备份。如果备份已经没了、但汉化还在，按提示去掉界面注入即可。

## 说明

这是非官方项目，与 Anysphere 无关，也不是 Cursor 团队的语言包。Cursor 服务条款限制修改、翻译和衍生作品。使用即表示你自行承担风险，包括更新后补丁失效、启动时出现「安装已损坏」，以及 macOS 上需要重新签名。这里只发布补丁程序和译文，不包含 Cursor 安装包，也不绕过登录或付费。
