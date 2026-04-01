# heyclaude installer for Windows
# Run: powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  heyclaude installer (Windows)" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginName = "heyclaude"
$LocalBin = Join-Path $env:USERPROFILE ".local\bin"
$PluginDir = Join-Path $env:USERPROFILE ".claude\plugins\$PluginName"
$SettingsFile = Join-Path $env:USERPROFILE ".claude\settings.json"

# ── 1. Check Node.js ────────────────────────────────────────────────────────
Write-Host "▶ Checking Node.js..." -ForegroundColor White
try {
    $nodeVersion = & node --version 2>&1
    Write-Host "✓ Node.js $nodeVersion found" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js is not installed. Please install Node.js (v18+) first." -ForegroundColor Red
    Write-Host "  Download from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# ── 2. Install npm dependencies ─────────────────────────────────────────────
Write-Host ""
Write-Host "▶ Installing dependencies..." -ForegroundColor White
Push-Location $ScriptDir
try {
    & npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    Write-Host "✓ Dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to install dependencies: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}

# ── 3. Build TypeScript ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "▶ Building TypeScript..." -ForegroundColor White
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
    Write-Host "✓ Build complete" -ForegroundColor Green
} catch {
    Write-Host "✗ Build failed: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# ── 4. Create CLI wrapper in ~/.local/bin ────────────────────────────────────
Write-Host ""
Write-Host "▶ Creating CLI wrapper in $LocalBin..." -ForegroundColor White

if (-not (Test-Path $LocalBin)) {
    New-Item -ItemType Directory -Path $LocalBin -Force | Out-Null
}

$cliJsPath = Join-Path $ScriptDir "dist\cli.js"
$cmdWrapper = Join-Path $LocalBin "heyclaude.cmd"

@"
@echo off
node "$cliJsPath" %*
"@ | Set-Content -Path $cmdWrapper -Encoding ASCII

Write-Host "✓ CLI wrapper created at $cmdWrapper" -ForegroundColor Green

# ── 5. Add ~/.local/bin to user PATH if not present ──────────────────────────
Write-Host ""
Write-Host "▶ Checking PATH..." -ForegroundColor White

$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notlike "*$LocalBin*") {
    $newPath = "$LocalBin;$userPath"
    [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
    $env:PATH = "$LocalBin;$env:PATH"
    Write-Host "✓ Added $LocalBin to user PATH" -ForegroundColor Green
    Write-Host "  ⚠ Restart your terminal for PATH changes to take effect." -ForegroundColor Yellow
} else {
    Write-Host "✓ $LocalBin already in PATH" -ForegroundColor Green
}

# ── 6. Create plugin directory and copy hooks ────────────────────────────────
Write-Host ""
Write-Host "▶ Installing Claude Code plugin to $PluginDir..." -ForegroundColor White

$hooksDir = Join-Path $PluginDir "hooks"
if (-not (Test-Path $hooksDir)) {
    New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null
}

# Copy hook files
Copy-Item (Join-Path $ScriptDir "hooks\hooks.json")   (Join-Path $hooksDir "hooks.json")   -Force
Copy-Item (Join-Path $ScriptDir "hooks\pre-tool.js")   (Join-Path $hooksDir "pre-tool.js")  -Force
Copy-Item (Join-Path $ScriptDir "hooks\post-tool.js")  (Join-Path $hooksDir "post-tool.js") -Force
Copy-Item (Join-Path $ScriptDir "hooks\prompt.js")     (Join-Path $hooksDir "prompt.js")    -Force

Write-Host "✓ Hook files copied" -ForegroundColor Green

# ── 7. Create plugin manifest ────────────────────────────────────────────────
$pluginJson = @{
    name        = "heyclaude"
    version     = "0.1.0"
    description = "Animated mascot for Claude Code sessions"
    hooksDir    = "$hooksDir"
} | ConvertTo-Json -Depth 10

Set-Content -Path (Join-Path $PluginDir "plugin.json") -Value $pluginJson -Encoding UTF8
Write-Host "✓ Plugin manifest created" -ForegroundColor Green

# ── 8. Register hooks in Claude Code settings ────────────────────────────────
Write-Host ""
Write-Host "▶ Registering hooks in $SettingsFile..." -ForegroundColor White

$claudeDir = Join-Path $env:USERPROFILE ".claude"
if (-not (Test-Path $claudeDir)) {
    New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null
}

# Load or create settings
if (Test-Path $SettingsFile) {
    $settings = Get-Content $SettingsFile -Raw | ConvertFrom-Json
} else {
    $settings = [PSCustomObject]@{}
}

# Ensure hooks property exists
if (-not ($settings.PSObject.Properties.Name -contains "hooks")) {
    $settings | Add-Member -NotePropertyName "hooks" -NotePropertyValue ([PSCustomObject]@{})
}

$hookMap = @{
    "PreToolUse"       = "pre-tool.js"
    "PostToolUse"      = "post-tool.js"
    "UserPromptSubmit" = "prompt.js"
    "Stop"             = "prompt.js --waiting"
}

foreach ($event in $hookMap.Keys) {
    $hookFile = $hookMap[$event]
    $hookCmd = "node `"$hooksDir\$hookFile`""

    # Ensure the event array exists
    if (-not ($settings.hooks.PSObject.Properties.Name -contains $event)) {
        $settings.hooks | Add-Member -NotePropertyName $event -NotePropertyValue @()
    }

    # Check for existing heyclaude hook
    $existing = $settings.hooks.$event | Where-Object {
        $_.hooks | Where-Object { $_.command -like "*heyclaude*" }
    }

    if (-not $existing) {
        $hookEntry = [PSCustomObject]@{
            hooks = @(
                [PSCustomObject]@{
                    type    = "command"
                    command = $hookCmd
                    timeout = 2
                }
            )
        }

        # Append to the array
        $arr = @($settings.hooks.$event) + $hookEntry
        $settings.hooks.$event = $arr
    }
}

$settings | ConvertTo-Json -Depth 10 | Set-Content -Path $SettingsFile -Encoding UTF8
Write-Host "✓ Hooks registered in settings.json" -ForegroundColor Green

# ── 9. Done ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  ✓  heyclaude installed!" -ForegroundColor Green
Write-Host ""
Write-Host "  Usage:"
Write-Host "    heyclaude start   — start daemon + open mascot pane"
Write-Host "    heyclaude stop    — stop daemon"
Write-Host "    heyclaude animal  — see your session's mascot"
Write-Host ""
Write-Host "  Note: tmux is not available on Windows." -ForegroundColor Yellow
Write-Host "  The mascot will run in web mode." -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
