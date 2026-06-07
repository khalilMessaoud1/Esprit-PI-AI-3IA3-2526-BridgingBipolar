# Copy all .env.example files to .env (skip if .env already exists)
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

$pairs = @(
    @("apps\web\.env.example", "apps\web\.env"),
    @("apps\api\.env.example", "apps\api\.env"),
    @("apps\prescription-service\.env.example", "apps\prescription-service\.env"),
    @("inetgration\youssef\.env.example", "inetgration\youssef\.env")
)

foreach ($pair in $pairs) {
    $src = Join-Path $Root $pair[0]
    $dst = Join-Path $Root $pair[1]
    if (-not (Test-Path $src)) {
        Write-Warning "Missing template: $($pair[0])"
        continue
    }
    if (Test-Path $dst) {
        Write-Host "Skip (exists): $($pair[1])" -ForegroundColor DarkGray
    } else {
        Copy-Item $src $dst
        Write-Host "Created: $($pair[1])" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Edit each .env with your local values (DB, Ollama, optional Twilio/Redis)." -ForegroundColor Cyan
