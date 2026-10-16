<#
  publish.ps1 — 一键把本地页面同步发布到 GitHub Pages (ZeonMacha.github.io)

  用法：
    · 双击 publish.cmd（推荐，绕开所有执行策略限制）
    · 或在 PowerShell 里：  .\publish.ps1
    · 或右键本文件 →「使用 PowerShell 运行」

  做的事：
    1. 检查仓库状态、当前分支
    2. 显示将要发布的改动（你确认后才会继续）
    3. git add / commit / push origin main
    4. 轮询等待 GitHub Pages 重建，并核对线上文件与本地逐字节一致
#>

[CmdletBinding()]
param(
    # 跳过确认提示，直接发布
    [switch]$Yes,
    # 只检查、不推送
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# ---- 让中文正常显示，避免乱码 ----
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

# ======================= 配置 =======================
# 仓库目录：默认取本脚本所在目录，所以脚本放哪都行
$RepoPath   = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$PageFile   = 'at2_dualstall.html'
$Branch     = 'main'
$Remote     = 'origin'
$SiteUrl    = 'https://zeonmacha.github.io/at2_dualstall.html'
$BuildWaitS = 240      # 等待 Pages 重建的最长秒数
# ====================================================

function Write-Head($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Write-Ok($t)   { Write-Host "  [OK]   $t" -ForegroundColor Green }
function Write-Warn2($t){ Write-Host "  [警告] $t" -ForegroundColor Yellow }
function Write-Err2($t) { Write-Host "  [错误] $t" -ForegroundColor Red }
function Fail($t) { Write-Err2 $t; Write-Host "`n发布已中止，未做任何改动。" -ForegroundColor Red; exit 1 }

# git 会把进度写到 stderr，而 $ErrorActionPreference='Stop' 会把 stderr 当成
# 致命错误。这里把 stdout / stderr 分开接住，只按退出码判断成败。
# 注意：不能用 Start-Process 的 -ArgumentList，它按空格拆分会把带空格的
# commit message 拆成多个参数。这里手动做 Windows 命令行转义。
function ConvertTo-ArgString {
    # 参数名不能叫 $Args：在函数内部 $Args 是 PowerShell 自动变量（当前未绑定
    # 的参数数组），同名会被静默覆盖成空数组，导致 git 收不到任何参数。
    param([string[]]$Parts)
    ($Parts | ForEach-Object {
        $a = $_
        if ($a -match '[\s"]') {
            # 转义：内部反斜杠+引号规则，最后再包一层双引号
            '"' + ($a -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
        } else { $a }
    }) -join ' '
}

function Invoke-Git {
    param([string[]]$Cmd, [switch]$Quiet)
    $outF = Join-Path $env:TEMP ("gitout_" + [guid]::NewGuid().ToString('N') + ".txt")
    $errF = Join-Path $env:TEMP ("giterr_" + [guid]::NewGuid().ToString('N') + ".txt")
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName               = 'git'
        $psi.Arguments              = ConvertTo-ArgString $Cmd
        $psi.UseShellExecute        = $false
        $psi.CreateNoWindow         = $true
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError  = $true
        $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
        $psi.StandardErrorEncoding  = [System.Text.Encoding]::UTF8
        $psi.WorkingDirectory       = $RepoPath

        $proc = [System.Diagnostics.Process]::Start($psi)
        # 先异步读干净，避免大输出把管道缓冲写满导致死锁
        $outTask = $proc.StandardOutput.ReadToEndAsync()
        $errTask = $proc.StandardError.ReadToEndAsync()
        $proc.WaitForExit()
        $stdout = $outTask.Result
        $stderr = $errTask.Result
        $code   = $proc.ExitCode
        $proc.Dispose()

        if (-not $Quiet) {
            foreach ($l in ($stdout -split "`r?`n")) { if ($l.Trim()) { Write-Host "    $l" -ForegroundColor DarkGray } }
            foreach ($l in ($stderr -split "`r?`n")) { if ($l.Trim()) { Write-Host "    $l" -ForegroundColor DarkGray } }
        }
        return [pscustomobject]@{ Code = $code; Out = $stdout; Err = $stderr }
    } finally {
        Remove-Item $outF, $errF -Force -ErrorAction SilentlyContinue
    }
}

# ---------- 0. 检查环境 ----------
Write-Host "GitHub Pages 发布脚本" -ForegroundColor White
Write-Host "仓库: $RepoPath"

if (-not (Test-Path (Join-Path $RepoPath '.git'))) {
    Fail "这里不是 git 仓库：$RepoPath`n请把本脚本放在 github-pages 目录下。"
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Fail "找不到 git 命令。请先安装 Git 并确保它在 PATH 中。"
}
Set-Location $RepoPath

$pagePath = Join-Path $RepoPath $PageFile
if (-not (Test-Path $pagePath)) { Fail "找不到页面文件：$PageFile" }

# ---------- 1. 分支与同步状态 ----------
Write-Head "1/5 检查仓库状态"

$curBranch = (Invoke-Git -Cmd @('rev-parse','--abbrev-ref','HEAD') -Quiet).Out.Trim()
if ($curBranch -ne $Branch) {
    Write-Warn2 "当前分支是 '$curBranch'，脚本预期 '$Branch'。"
    if (-not $Yes) {
        $a = Read-Host "  仍要继续吗？(y/N)"
        if ($a -notmatch '^[Yy]') { Fail "已取消（分支不符）。" }
    }
}

# 拉取远端最新，避免落后于 GitHub（例如你在网页上直接改过）
$r = Invoke-Git -Cmd @('fetch',$Remote,$Branch) -Quiet
if ($r.Code -ne 0) { Fail "git fetch 失败，请检查网络或 GitHub 登录状态。`n$($r.Err)" }

$behind = (Invoke-Git -Cmd @('rev-list','--count',"HEAD..$Remote/$Branch") -Quiet).Out.Trim()

if ([int]$behind -gt 0) {
    Fail "本地落后远端 $behind 个提交（远端有你在别处做的改动）。`n请先执行： git pull $Remote $Branch`n然后再运行本脚本，以免覆盖。"
}
Write-Ok "分支 $curBranch，与 $Remote/$Branch 已同步"

# ---------- 2. 显示改动 ----------
Write-Head "2/5 将要发布的改动"

Invoke-Git -Cmd @('add','-A','--',$PageFile) -Quiet | Out-Null
$staged = (Invoke-Git -Cmd @('diff','--cached','--name-only') -Quiet).Out.Trim()
if (-not $staged) {
    Write-Warn2 "没有检测到任何改动，文件与已发布的版本相同。"
    Write-Host "  线上地址: $SiteUrl" -ForegroundColor White
    exit 0
}

Invoke-Git -Cmd @('--no-pager','diff','--cached','--stat','--',$PageFile) | Out-Null
$fullDiff = (Invoke-Git -Cmd @('--no-pager','diff','--cached','-U0','--',$PageFile) -Quiet).Out
$changed  = ($fullDiff -split "`r?`n") | Where-Object { $_ -match '^[+-]' -and $_ -notmatch '^(\+\+\+|---)' }
Write-Host ("  共 {0} 行变化" -f $changed.Count) -ForegroundColor White
Write-Host "  内容摘要（前 25 行）:" -ForegroundColor DarkGray
$changed | Select-Object -First 25 | ForEach-Object {
    Write-Host ("    " + $_.Substring(0, [Math]::Min(110, $_.Length))) -ForegroundColor DarkGray
}
if ($changed.Count -gt 25) { Write-Host ("    …还有 {0} 行" -f ($changed.Count - 25)) -ForegroundColor DarkGray }

if ($DryRun) { Write-Host "`n[DryRun] 只检查不推送。" -ForegroundColor Yellow; exit 0 }

if (-not $Yes) {
    Write-Host ""
    $ans = Read-Host "  确认发布以上改动到 GitHub Pages？(y/N)"
    if ($ans -notmatch '^[Yy]') {
        Invoke-Git -Cmd @('reset','-q','--',$PageFile) -Quiet | Out-Null
        Write-Host "  已取消，暂存区已还原。" -ForegroundColor Yellow
        exit 0
    }
}

# ---------- 3. 提交 ----------
Write-Head "3/5 提交"

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$msg   = "Publish dualstall page ($stamp)"
$r = Invoke-Git -Cmd @('-c','core.safecrlf=false','commit','-q','-m',$msg,'--',$PageFile)
if ($r.Code -ne 0) { Fail "git commit 失败（可能是未配置 user.name / user.email）。`n$($r.Err)" }
$newSha = (Invoke-Git -Cmd @('rev-parse','--short','HEAD') -Quiet).Out.Trim()
Write-Ok "已提交 $newSha — $msg"

# ---------- 4. 推送 ----------
Write-Head "4/5 推送到 GitHub"

$r = Invoke-Git -Cmd @('push',$Remote,$Branch)
if ($r.Code -ne 0) { Fail "git push 失败。若提示认证问题，请在 Git Credential Manager 里重新登录 GitHub。`n$($r.Err)" }
Write-Ok "已推送 $newSha 到 $Remote/$Branch"

# ---------- 5. 等待并核对线上 ----------
Write-Head "5/5 等待 GitHub Pages 重建"

# 校验基准用「git 里已提交的那份内容」，而不是工作区文件。
# 原因：工作区文件可能带 CRLF，而 git 入库时按规则存成 LF，Pages 部署的是
# LF 版本；直接比工作区会因换行符差异而永远对不上。
$blobBytes = $null
$tmpBlob = Join-Path $env:TEMP ("blob_" + [guid]::NewGuid().ToString('N'))
try {
    $r = Invoke-Git -Cmd @('show',"HEAD:$PageFile") -Quiet
    if ($r.Code -eq 0) {
        [System.IO.File]::WriteAllText($tmpBlob, $r.Out, (New-Object System.Text.UTF8Encoding($false)))
        $blobBytes = [System.IO.File]::ReadAllBytes($tmpBlob)
    }
} catch { } finally { Remove-Item $tmpBlob -Force -ErrorAction SilentlyContinue }

if (-not $blobBytes) {
    Write-Warn2 "无法读取 git 中的文件内容，跳过逐字节校验。"
    $blobBytes = [System.IO.File]::ReadAllBytes($pagePath)
}

$sha256 = [System.Security.Cryptography.SHA256]::Create()
$localHash = (($sha256.ComputeHash($blobBytes)) | ForEach-Object { $_.ToString('x2') }) -join ''
Write-Host ("  已提交内容 SHA256: {0}" -f $localHash.Substring(0,16)) -ForegroundColor DarkGray
Write-Host ("  基准大小: {0} 字节" -f $blobBytes.Length) -ForegroundColor DarkGray
Write-Host "  正在轮询 $SiteUrl ..." -ForegroundColor DarkGray

$deadline = (Get-Date).AddSeconds($BuildWaitS)
$live = $false
$lastLen = -1
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 10
    try {
        $resp = Invoke-WebRequest -Uri $SiteUrl -TimeoutSec 25 -UseBasicParsing
        # 直接对「原始字节」做哈希，绝不要先解码成字符串再编码回去
        $raw = $resp.RawContentStream.ToArray()
        $liveHash = (($sha256.ComputeHash($raw)) | ForEach-Object { $_.ToString('x2') }) -join ''

        if ($liveHash -eq $localHash) {
            Write-Ok "线上文件与已提交内容逐字节一致（$($raw.Length) 字节）"
            $live = $true
            break
        }
        # 只在大小变化时打印一行，避免刷屏
        if ($raw.Length -ne $lastLen) {
            Write-Host ("    {0} 构建中…（线上 {1} 字节 / 目标 {2} 字节）" -f `
                (Get-Date -Format 'HH:mm:ss'), $raw.Length, $blobBytes.Length) -ForegroundColor DarkGray
            $lastLen = $raw.Length
        }
    } catch {
        Write-Host ("    {0} 连接失败，重试中…" -f (Get-Date -Format 'HH:mm:ss')) -ForegroundColor DarkGray
    }
}

Write-Host ""
if ($live) {
    Write-Host "发布成功！" -ForegroundColor Green
} else {
    Write-Warn2 "已推送成功，但 $BuildWaitS 秒内线上还没更新完。"
    Write-Host "  通常再等 1 分钟即可，也可到 Actions 页面查看构建进度：" -ForegroundColor Yellow
    Write-Host "  https://github.com/ZeonMacha/ZeonMacha.github.io/actions" -ForegroundColor DarkGray
}
Write-Host "  页面地址: $SiteUrl" -ForegroundColor White
Write-Host "  本次提交: $newSha" -ForegroundColor White
Write-Host ""
