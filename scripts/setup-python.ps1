# Create Python virtualenvs for ML, handwriting, and RAG services (run once).
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command py -ErrorAction SilentlyContinue }
if (-not $py) {
    Write-Host "Python not found. Install Python 3.11+ and retry." -ForegroundColor Red
    exit 1
}
$python = $py.Source

function Setup-Venv {
    param(
        [string]$Label,
        [string]$Dir,
        [string]$Requirements
    )
    $path = Join-Path $Root $Dir
    if (-not (Test-Path $path)) {
        Write-Warning "Skip $Label — missing $Dir"
        return
    }
    Write-Host ""
    Write-Host "== $Label ($Dir) ==" -ForegroundColor Cyan
    Set-Location $path
    if (-not (Test-Path ".venv\Scripts\python.exe")) {
        & $python -m venv .venv
        Write-Host "  created .venv" -ForegroundColor Green
    } else {
        Write-Host "  .venv exists" -ForegroundColor DarkGray
    }
    if (Test-Path $Requirements) {
        & .\.venv\Scripts\pip install -r $Requirements
    } else {
        & .\.venv\Scripts\pip install uvicorn fastapi
    }
}

Setup-Venv "ML service" "apps\ml-service" "requirements.txt"
Setup-Venv "Handwriting API" "apps\handwriting-api" "requirements.txt"
Setup-Venv "RAG API" "rag_api" "requirements-lite.txt"
Setup-Venv "Phase monitor (voix)" "inetgration\integration_kh" "requirements.txt"

Set-Location $Root
Write-Host ""
Write-Host "Python environments ready." -ForegroundColor Green
