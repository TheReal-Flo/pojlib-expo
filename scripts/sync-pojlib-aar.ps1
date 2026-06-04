param(
  [string]$SourceAar
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$defaultSourceAar = Join-Path $repoRoot 'Pojlib-reference\build\outputs\aar\Pojlib-release.aar'
$targetDir = Join-Path $repoRoot 'android\libs'
$targetAar = Join-Path $targetDir 'Pojlib-release.aar'

if ([string]::IsNullOrWhiteSpace($SourceAar)) {
  $SourceAar = $defaultSourceAar
}

if (-not (Test-Path $SourceAar)) {
  throw "Pojlib AAR not found at '$SourceAar'."
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item $SourceAar $targetAar -Force

Write-Output "Synced Pojlib AAR to $targetAar"
