# BridgingBipolar — start full local dev stack (Windows).
# Usage:
#   .\scripts\start-dev.ps1
#   .\scripts\start-dev.ps1 -SkipDeps          # skip Docker / Prisma (already up)
#   .\scripts\start-dev.ps1 -WebPort 3002      # alternate port

param(
    [switch]$SkipDeps,
    [int]$WebPort = 3000
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

Set-Location $Root

Write-Host ""
Write-Host "BridgingBipolar dev stack" -ForegroundColor Cyan
Write-Host "Project: $Root"
Write-Host ""

if (-not $SkipDeps) {
    Write-Host "[1/2] Docker (Postgres + Qdrant) + Prisma migrations..." -ForegroundColor Yellow
    npm run dev:deps
    if ($LASTEXITCODE -ne 0) {
        Write-Host "dev:deps failed. Start Docker Desktop, then retry." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[1/2] Skipping dev:deps (-SkipDeps)" -ForegroundColor DarkGray
}

Write-Host "[2/2] Launching services in separate windows..." -ForegroundColor Yellow
Write-Host ""

$webPortBusy = Get-NetTCPConnection -LocalPort $WebPort -State Listen -ErrorAction SilentlyContinue
if ($webPortBusy) {
    Write-Host "WARNING: port $WebPort is already in use." -ForegroundColor Red
    Write-Host "  Close the old 'BB Web' PowerShell window first, or you'll see 404 / 'missing error components'." -ForegroundColor Red
    Write-Host ""
}

Write-Host "Manual step: keep the Ollama app running (llama3.2:3b on port 11434)." -ForegroundColor Magenta
Write-Host ""

function Start-DevWindow {
    param(
        [string]$Title,
        [string]$WorkingDirectory,
        [string]$Command
    )
    $dir = $WorkingDirectory.Replace("'", "''")
    $cmd = $Command.Replace("'", "''")
    $script = @"
`$Host.UI.RawUI.WindowTitle = '$Title'
Set-Location '$dir'
Write-Host '=== $Title ===' -ForegroundColor Cyan
Write-Host '$cmd' -ForegroundColor DarkGray
Write-Host ''
$Command
"@
    Start-Process powershell -ArgumentList @("-NoExit", "-Command", $script) | Out-Null
    Write-Host "  -> $Title" -ForegroundColor Green
}

# Order matches your usual manual startup (all run in parallel after deps).
Start-DevWindow "BB Phase Monitor :8001" `
    (Join-Path $Root "inetgration\integration_kh") `
    "py -3.13 -m uvicorn main:app --host 127.0.0.1 --port 8001"

Start-DevWindow "BB ML Service :5000" `
    $Root `
    "npm run dev:ml"

Start-DevWindow "BB Handwriting API :5002" `
    (Join-Path $Root "apps\handwriting-api") `
    "npm run dev:handwriting"

Start-DevWindow "BB RAG API :8090" `
    (Join-Path $Root "rag_api") `
    ".\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8090"

Start-DevWindow "BB Nest API :4001" `
    $Root `
    "npm run dev:api"

Start-DevWindow "BB Web :$WebPort" `
    $Root `
    "npm run dev:clean --workspace apps/web -- -p $WebPort"

Write-Host ""
Write-Host "All services launched." -ForegroundColor Cyan
Write-Host "  Web:            http://localhost:$WebPort"
Write-Host "  API:            http://localhost:4001"
Write-Host "  Handwriting:    http://127.0.0.1:5002"
Write-Host "  RAG:            http://localhost:8090"
Write-Host "  Phase monitor:  http://localhost:8001"
Write-Host "  ML service:     http://localhost:5000"
Write-Host ""
Write-Host "Close each PowerShell window to stop that service." -ForegroundColor DarkGray
