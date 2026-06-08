# Download trained model artifacts (ESPRIT — section A)
# Usage: .\scripts\download-models.ps1
#        .\scripts\download-models.ps1 -TrainKeystroke

param(
    [switch]$TrainKeystroke,
    [string]$Bundle = ""
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) {
    $py = Get-Command py -ErrorAction SilentlyContinue
}
if (-not $py) {
    Write-Host "Python not found. Install Python 3.11+ and retry." -ForegroundColor Red
    exit 1
}

$argsList = @("scripts/download_models.py")
if ($TrainKeystroke) { $argsList += "--train-keystroke" }
if ($Bundle) { $argsList += @("--bundle", $Bundle) }

& $py.Source @argsList
exit $LASTEXITCODE
