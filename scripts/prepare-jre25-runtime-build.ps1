param(
    [string]$DestinationPath = (Join-Path $PSScriptRoot "..\runtime-build\android-openjdk-build-multiarch"),
    [string]$RepoUrl = "https://github.com/QuestCraftPlusPlus/android-openjdk-build-multiarch.git",
    [string]$SourceBranch = "buildjre24",
    [string]$TargetBranch = "buildjre25"
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

function Replace-OrFail([string]$Content, [string]$Pattern, [string]$Replacement, [string]$Label) {
    $updated = [regex]::Replace($Content, $Pattern, $Replacement)
    if ($updated -eq $Content) {
        throw "Failed to update $Label."
    }
    return $updated
}

Require-Command git

$repoRoot = [System.IO.Path]::GetFullPath($DestinationPath)
$repoParent = Split-Path -Parent $repoRoot
New-Item -ItemType Directory -Force -Path $repoParent | Out-Null

if (-not (Test-Path $repoRoot)) {
    git clone --branch $SourceBranch --single-branch $RepoUrl $repoRoot
}

Push-Location $repoRoot
try {
    git fetch --all --prune

    $currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($currentBranch -ne $TargetBranch) {
        $hasTargetBranch = $null
        try {
            $hasTargetBranch = (git rev-parse --verify $TargetBranch 2>$null).Trim()
        } catch {
            $hasTargetBranch = $null
        }

        if ($hasTargetBranch) {
            git checkout $TargetBranch
        } else {
            git checkout -B $TargetBranch "origin/$SourceBranch"
        }
    }

    $workflowPath = Join-Path $repoRoot ".github\workflows\build.yml"
    $workflow = Get-Content $workflowPath -Raw
    $workflow = Replace-OrFail $workflow 'Build OpenJDK 24' 'Build OpenJDK 25' 'workflow title'
    $workflow = Replace-OrFail $workflow 'version:\s*\[24\]' 'version: [25]' 'workflow matrix version'
    $workflow = Replace-OrFail $workflow 'set up JDK 23' 'set up JDK 25' 'workflow setup-java label'
    $workflow = Replace-OrFail $workflow 'java-version:\s*23\.0\.2\+7' 'java-version: 25' 'workflow setup-java version'
    Set-Content -Path $workflowPath -Value $workflow -NoNewline

    $clonePath = Join-Path $repoRoot "5_clonejdk.sh"
    $cloneScript = @'
#!/bin/bash
set -e

if [[ $TARGET_VERSION -eq 25 ]]; then
  git clone --branch jdk25 --depth 1 https://github.com/graalvm/labs-openjdk.git openjdk
else
  git clone --depth 1 https://github.com/openjdk/jdk17u openjdk-17
fi
'@
    Set-Content -Path $clonePath -Value $cloneScript -NoNewline

    $buildPath = Join-Path $repoRoot "6_buildjdk.sh"
    $buildScript = Get-Content $buildPath -Raw
    $buildScript = Replace-OrFail $buildScript 'if \[\[ \$TARGET_VERSION -eq 24 \]\]; then' 'if [[ $TARGET_VERSION -eq 24 ]] || [[ $TARGET_VERSION -eq 25 ]]; then' 'target version conditional'
    if ($buildScript -notmatch 'export BOOT_JDK="\$\{JAVA_HOME:-[^"]+\}"') {
        $bootJdkReplacement = '. setdevkitpath.sh' + [Environment]::NewLine + 'export BOOT_JDK="${JAVA_HOME:-/home/compiler/actions-runner/_work/_tool/Java_Temurin-Hotspot_jdk/25/x64}"'
        $buildScript = Replace-OrFail $buildScript '\. setdevkitpath\.sh' $bootJdkReplacement 'BOOT_JDK export'
    }
    $buildScript = Replace-OrFail $buildScript '--with-boot-jdk=/home/compiler/actions-runner/_work/_tool/Java_Temurin-Hotspot_jdk/23\.0\.2-7/x64' '--with-boot-jdk=$BOOT_JDK' 'configure boot JDK path'
    Set-Content -Path $buildPath -Value $buildScript -NoNewline

    $sourcePatchDir = Join-Path $repoRoot "patches\jre_24"
    $targetPatchDir = Join-Path $repoRoot "patches\jre_25"
    if (-not (Test-Path $targetPatchDir)) {
        Copy-Item -Recurse -Force $sourcePatchDir $targetPatchDir
    }

    $packScriptSource = Join-Path $PSScriptRoot "pack-jre25-runtime.sh"
    $packScriptTarget = Join-Path $repoRoot "10_packjrezip.sh"
    Copy-Item -Force $packScriptSource $packScriptTarget

    $normalizablePatterns = @(
        "*.sh",
        "*.diff",
        "*.yml",
        "*.yaml",
        "*.md",
        "*.txt",
        "*.properties",
        "*.src",
        "*.info",
        "Dockerfile",
        "android-wrapped-clang",
        "android-wrapped-clang++",
        "ios-arm64-clang",
        "ios-arm64-clang++",
        "macos-host-cc"
    )

    foreach ($pattern in $normalizablePatterns) {
        Get-ChildItem -Path $repoRoot -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {
            $content = [System.IO.File]::ReadAllText($_.FullName)
            $normalized = $content -replace "`r`n", "`n"
            if ($normalized -ne $content) {
                [System.IO.File]::WriteAllText($_.FullName, $normalized, (New-Object System.Text.UTF8Encoding($false)))
            }
        }
    }

    Write-Host "Prepared $repoRoot on branch '$TargetBranch'."
    Write-Host "Next steps:"
    Write-Host "  1. Review patches under patches/jre_25/android"
    Write-Host "  2. Run the upstream build workflow or local build"
    Write-Host "  3. Run ./10_packjrezip.sh <repacked-output-dir> [JRE25.zip]"
    Write-Host "  4. Upload JRE25.zip to a GitHub release as asset name JRE25.zip"
} finally {
    Pop-Location
}
