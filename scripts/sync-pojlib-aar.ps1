param(
  [string]$SourceAar = "$env:USERPROFILE\Downloads\Pojlib-release.aar"
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $repoRoot 'android\libs'
$targetAar = Join-Path $targetDir 'Pojlib-release.aar'

if (-not (Test-Path $SourceAar)) {
  throw "Pojlib AAR not found at '$SourceAar'."
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item $SourceAar $targetAar -Force

Write-Output "Synced Pojlib AAR to $targetAar"
