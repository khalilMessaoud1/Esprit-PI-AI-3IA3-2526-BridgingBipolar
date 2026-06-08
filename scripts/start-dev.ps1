# BridgingBipolar — start full local dev stack (Windows).
# Usage:
#   .\scripts\start-dev.ps1
#   .\scripts\start-dev.ps1 -SkipDeps
#   .\scripts\start-dev.ps1 -WebPort 3002

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

function Test-VenvReady {
    param([string]$RelativePath)
    Test-Path (Join-Path $Root "$RelativePath\.venv\Scripts\python.exe")
}

function Get-VenvPythonCommand {
    param(
        [string]$ServiceDir,
        [string]$UvicornArgs
    )
    $venvPy = Join-Path $Root "$ServiceDir\.venv\Scripts\python.exe"
    if (Test-Path $venvPy) {
        return ".\.venv\Scripts\python.exe $UvicornArgs"
    }
    Write-Host "WARNING: .venv missing in $ServiceDir — run .\scripts\setup-python.ps1" -ForegroundColor Red
    return "python $UvicornArgs"
}

function Start-DevWindow {
    param(
        [string]$Title,
        [string]$WorkingDirectory,
        [string]$Command
    )
    $dir = $WorkingDirectory.Replace("'", "''")
    $escapedCmd = $Command.Replace("'", "''")
    $script = @"
`$Host.UI.RawUI.WindowTitle = '$Title'
Set-Location '$dir'
Write-Host '=== $Title ===' -ForegroundColor Cyan
Write-Host '$escapedCmd' -ForegroundColor DarkGray
Write-Host ''
$Command
"@
    Start-Process powershell -ArgumentList @("-NoExit", "-Command", $script) | Out-Null
    Write-Host "  -> $Title" -ForegroundColor Green
}

$pythonServices = @(
    "apps\ml-service",
    "apps\handwriting-api",
    "rag_api",
    "inetgration\integration_kh"
)
$missingVenv = @($pythonServices | Where-Object { -not (Test-VenvReady $_) })

if ($missingVenv.Count -gt 0) {
    Write-Host "[1/3] Python venvs missing — running setup-python.ps1..." -ForegroundColor Yellow
    & (Join-Path $PSScriptRoot "setup-python.ps1")
    if ($LASTEXITCODE -ne 0) {
        Write-Host "setup-python.ps1 failed. Install Python 3.11+ and retry." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[1/3] Python venvs OK" -ForegroundColor DarkGray
}

if (-not $SkipDeps) {
    Write-Host "[2/3] Docker + Prisma..." -ForegroundColor Yellow
    npm run dev:deps
    if ($LASTEXITCODE -ne 0) {
        Write-Host "dev:deps failed. Start Docker Desktop, then retry." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[2/3] Skipping dev:deps (-SkipDeps)" -ForegroundColor DarkGray
    npm run prisma:generate --workspace apps/api 2>$null
}

Write-Host "[3/3] Launching services..." -ForegroundColor Yellow
Write-Host ""

$webPortBusy = Get-NetTCPConnection -LocalPort $WebPort -State Listen -ErrorAction SilentlyContinue
if ($webPortBusy) {
    Write-Host "WARNING: port $WebPort is in use. Close BB Web or use -WebPort 3002" -ForegroundColor Red
}

Write-Host "Keep Ollama running (llama3.2:3b on port 11434) for companion/OCR." -ForegroundColor Magenta
Write-Host ""

$phaseMonitorCmd = Get-VenvPythonCommand "inetgration\integration_kh" "-m uvicorn main:app --host 127.0.0.1 --port 8001"
$ragCmd = Get-VenvPythonCommand "rag_api" "-m uvicorn app.main:app --reload --host 0.0.0.0 --port 8090"

Start-DevWindow "BB Phase Monitor :8001" (Join-Path $Root "inetgration\integration_kh") $phaseMonitorCmd
Start-DevWindow "BB ML Service :5000" $Root "npm run dev:ml"
Start-DevWindow "BB Handwriting API :5002" (Join-Path $Root "apps\handwriting-api") "npm run dev:handwriting"
Start-DevWindow "BB RAG API :8090" (Join-Path $Root "rag_api") $ragCmd
Start-DevWindow "BB Nest API :4001" $Root "npm run dev:api"
Start-DevWindow "BB Web :$WebPort" $Root "npm run dev:clean --workspace apps/web -- -p $WebPort"

Write-Host ""
Write-Host "All services launched." -ForegroundColor Cyan
Write-Host "  Web:            http://localhost:$WebPort"
Write-Host "  API:            http://localhost:4001"
Write-Host "  Handwriting:    http://127.0.0.1:5002"
Write-Host "  RAG:            http://localhost:8090"
Write-Host "  Phase monitor:  http://localhost:8001"
Write-Host "  ML service:     http://localhost:5000"
