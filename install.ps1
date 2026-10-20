# Cursor 汉化的 Windows 备用脚本。
# Mac 请双击「Cursor 汉化」，或用仓库里的 install.sh。不要用这个文件。
# 需要已经安装 Node.js 18 或更新版本，并且先完全退出 Cursor。
param(
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) {
  Write-Host $Message
}

Write-Info "这是 Cursor 汉化在 Windows 上的备用办法。"
Write-Info "请先完全退出 Cursor。只点 Reload Window 不够。"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Info "没有找到 Node.js。请先打开 https://nodejs.org 安装 18 或更新版本，然后重新运行这个脚本。"
  exit 1
}

$work = Join-Path $env:TEMP "cursor-zh-hans-src"
$zip = Join-Path $env:TEMP "cursor-zh-hans-src.zip"
if (Test-Path $work) {
  Remove-Item -Recurse -Force $work
}
New-Item -ItemType Directory -Path $work | Out-Null

Write-Info "正在下载汉化程序…"
Invoke-WebRequest -Uri "https://github.com/Po1nt9/cursor-agents-zh-hans/archive/refs/heads/main.zip" -OutFile $zip
Expand-Archive -Path $zip -DestinationPath $work -Force
$repo = Join-Path $work "cursor-agents-zh-hans-main"
if (-not (Test-Path (Join-Path $repo "bin\cursor-zh.js"))) {
  Write-Info "下载的内容不完整。请稍后再试。"
  exit 1
}

Set-Location $repo
if ($Uninstall) {
  Write-Info "正在恢复成英文…"
  & node .\bin\cursor-zh.js restore
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Info "已经恢复。界面如果还是中文，请完全退出 Cursor 再打开。"
} else {
  Write-Info "正在安装汉化…"
  & node .\bin\cursor-zh.js apply --update-checksums
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Info "安装步骤已经跑完。请重新打开 Cursor。"
  Write-Info "如果钥匙串或系统弹出存储权限，请允许。"
}
