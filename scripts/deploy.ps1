# 手动部署到 Cloudflare（一条命令跑完全流程）
# 用法：右键「使用 PowerShell 运行」，或在项目目录执行
#   powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
# 说明：第一次会弹浏览器要求登录 Cloudflare；之后每次只做构建 + 部署。
#      过程中的红字多为 wrangler/npm 写到 stderr 的提示（如代理告警），不影响结果。

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($n, $text) { Write-Host "`n[$n/4] $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "  OK  $text" -ForegroundColor Green }
function Warn($text) { Write-Host "  !   $text" -ForegroundColor Yellow }
function Die($text) { Write-Host "`n失败：$text" -ForegroundColor Red; exit 1 }

# 0. 环境检查
Step 0 '检查环境'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Die '没找到 node，请先安装 Node.js 20+（https://nodejs.org）'
}
Ok ("node " + (node -v) + " / npm " + (npm -v))

# 1. 依赖
Step 1 '安装依赖（已装过会很快）'
if (-not (Test-Path 'node_modules')) {
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Die 'npm install 失败' }
  Ok '依赖已安装'
} else {
  Warn 'node_modules 已存在，跳过'
}

# 2. 登录
Step 2 '检查 Cloudflare 登录状态'
$whoami = (& npx --no-install wrangler whoami 2>$null | Out-String)
if ($LASTEXITCODE -ne 0 -or $whoami -notmatch 'associated with the email') {
  Warn '未登录（或 token 过期），正在打开浏览器授权页…登录后回到这个窗口'
  & npx --no-install wrangler login
  if ($LASTEXITCODE -ne 0) { Die 'wrangler login 失败' }
  $whoami = (& npx --no-install wrangler whoami 2>$null | Out-String)
  if ($whoami -notmatch 'associated with the email') { Die '仍然读不到登录信息，先手动跑 npx wrangler login' }
}
$email = ([regex]::Match($whoami, 'associated with the email ([^\s]+)')).Groups[1].Value.TrimEnd('.')
$account = ([regex]::Match($whoami, '([0-9a-f]{32})')).Groups[1].Value
Ok ("账号 " + $email + " / Account " + $account)

# 3. 构建
Step 3 '构建前端（vite build）'
npm run build
if ($LASTEXITCODE -ne 0) { Die '构建失败，看上面的报错' }
if (-not (Test-Path 'dist/index.html')) { Die 'dist/index.html 不存在，构建没产出' }
Ok 'dist/ 已生成'

# 4. 部署
Step 4 '上传到 Cloudflare（wrangler deploy）'
$deployOut = (& npx --no-install wrangler deploy 2>&1 | Out-String)
Write-Host $deployOut
if ($LASTEXITCODE -ne 0) { Die '部署失败，看上面的报错' }
$url = ([regex]::Match($deployOut, 'https://[^\s]+workers\.dev')).Value

Write-Host "`n完成。" -ForegroundColor Green
if ($url) {
  Write-Host ("房间链接： " + $url + "/?room=房间号") -ForegroundColor Green
}
Write-Host '提示：这台机器打不开 workers.dev，请用手机流量验证。' -ForegroundColor DarkGray
