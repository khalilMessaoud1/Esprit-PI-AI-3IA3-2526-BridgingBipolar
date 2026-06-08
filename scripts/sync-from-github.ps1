# Sync local repo with GitHub when git pull fails (local changes or Git LFS errors).
# Usage: .\scripts\sync-from-github.ps1

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

Write-Host "Syncing with origin/main (skip Git LFS download — use download-models.ps1 for models)..." -ForegroundColor Cyan

$env:GIT_LFS_SKIP_SMUDGE = "1"
git fetch origin main
if ($LASTEXITCODE -ne 0) { exit 1 }

git reset --hard origin/main
if ($LASTEXITCODE -ne 0) { exit 1 }

Remove-Item Env:GIT_LFS_SKIP_SMUDGE -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Repository synced to:" (git log -1 --oneline) -ForegroundColor Green
Write-Host "Run .\scripts\download-models.ps1 if voice models are missing." -ForegroundColor Yellow
