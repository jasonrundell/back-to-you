# Merges the Back to You hook entries into Claude Code's settings.json.
#
# Run by install.bat as:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\merge-settings.ps1 ^
#     -SettingsPath "%CLAUDE_DIR%\settings.json" -HookDir "%CLAUDE_DIR%\hooks"
#
# This lives in its own file rather than inside install.bat because five hook
# entries - two of which carry matchers - do not fit legibly into a batch
# one-liner continued with carets. It mirrors tools/merge-settings.js, which
# does the same job on macOS.
#
# Exits non-zero on any failure so install.bat can restore its backup.
param(
    [Parameter(Mandatory = $true)][string]$SettingsPath,
    [Parameter(Mandatory = $true)][string]$HookDir
)

$ErrorActionPreference = 'Stop'

function New-Command {
    param([string]$Script, [string]$Argument)
    $cmd = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$HookDir\$Script`""
    if ($Argument) { $cmd += " -Category $Argument" }
    return $cmd
}

# Event, matcher (empty for none), script, argument (empty for none).
#
# Stop is the only event whose script decides its own category, by inspecting
# the assistant's last message. The other four are fixed.
#
# SessionStart is matched to 'startup' alone. It also fires on resume, clear,
# compact, and fork - an unmatched hook would replay the greeting on every
# /clear and after every auto-compaction.
#
# StopFailure is unmatched: it fires when a turn ends on an API error, and all
# of its error types deserve the same flat, unalarmed clip.
#
# PostToolUseFailure is deliberately NOT wired. It fires on every failed tool
# call - a grep that matches nothing, a red test run - and would buzz
# constantly.
#
# Notification is matched to the types that are genuinely a request for input.
# Unmatched it also fires on auth_success - a successful login saying "Your
# call." - and on agent_completed, which SubagentStop already owns.
#
# PreToolUse/AskUserQuestion covers the multiple-choice picker, which has no
# notification type of its own and would otherwise be the one decision-shaped
# moment in the product that stays silent.
#
# IMPORTANT: PreToolUse can BLOCK the tool call - exit code 2 means "do not do
# this". play-category.ps1 must never exit non-zero, or the question stops
# being asked at all.
$plan = @(
    @{ Event = 'Stop';         Matcher = '';        Script = 'play-sound.ps1';    Argument = '' }
    @{ Event = 'Notification'; Matcher = 'permission_prompt|agent_needs_input|elicitation_dialog'; Script = 'play-category.ps1'; Argument = 'decision-needed' }
    @{ Event = 'PreToolUse';   Matcher = 'AskUserQuestion'; Script = 'play-category.ps1'; Argument = 'decision-needed' }
    @{ Event = 'SessionStart'; Matcher = 'startup'; Script = 'play-category.ps1'; Argument = 'session-start' }
    @{ Event = 'SubagentStop'; Matcher = '';        Script = 'play-category.ps1'; Argument = 'subagent-done' }
    @{ Event = 'StopFailure';  Matcher = '';        Script = 'play-category.ps1'; Argument = 'error' }
)

# Read. Treat "absent" and "unparseable" as distinct: an unreadable file is an
# error to report, never something to quietly overwrite. This is the user's own
# config and may hold hooks and settings this installer knows nothing about.
$backup = ''

if (Test-Path $SettingsPath) {
    $raw = Get-Content $SettingsPath -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) {
        $config = [PSCustomObject]@{}
    } else {
        try {
            $config = $raw | ConvertFrom-Json
        } catch {
            Write-Host "ERROR: $SettingsPath exists but is not valid JSON." -ForegroundColor Red
            Write-Host "Fix or move it, then run this installer again. Nothing has been changed."
            exit 1
        }
    }

    $backup = "$SettingsPath.bak.$(Get-Date -Format yyyyMMddHHmmss)"
    Copy-Item $SettingsPath $backup -Force
    Write-Host "  OK Backed up settings to $backup"
} else {
    $config = [PSCustomObject]@{}
}

if (-not $config.PSObject.Properties['hooks'] -or $null -eq $config.hooks) {
    $config | Add-Member -NotePropertyName hooks -NotePropertyValue ([PSCustomObject]@{}) -Force
}

foreach ($item in $plan) {
    $event = $item.Event
    $command = New-Command -Script $item.Script -Argument $item.Argument

    if (-not $config.hooks.PSObject.Properties[$event] -or $null -eq $config.hooks.$event) {
        $config.hooks | Add-Member -NotePropertyName $event -NotePropertyValue @() -Force
    }

    # Four events share one script, so the -Category argument is what tells
    # their entries apart. Written as explicit loops rather than a piped
    # Where-Object chain, where `-and` and `|` precedence is easy to get
    # subtly wrong and hard to notice.
    $present = $false
    foreach ($group in @($config.hooks.$event)) {
        if (-not $group) { continue }
        foreach ($entry in @($group.hooks)) {
            if (-not $entry -or -not $entry.command) { continue }
            if ($entry.command -notlike "*$($item.Script)*") { continue }
            if (-not $item.Argument -or $entry.command -like "*$($item.Argument)*") {
                $present = $true
                break
            }
        }
        if ($present) { break }
    }

    if ($present) {
        Write-Host "  OK $event hook already present - skipping"
        continue
    }

    # An explicit short timeout: Claude Code's default for command hooks is
    # ten minutes, which is no safety net at all for something attached to
    # the end of every response.
    $group = @{ hooks = @(@{ type = 'command'; command = $command; timeout = 10 }) }
    if ($item.Matcher) { $group.matcher = $item.Matcher }

    $config.hooks.$event = @($config.hooks.$event) + $group
    Write-Host "  OK $event hook added"
}

# ConvertTo-Json escapes the Windows path separators correctly.
try {
    $json = $config | ConvertTo-Json -Depth 10
    Set-Content -Path $SettingsPath -Value $json -Encoding UTF8

    # Read it back and reparse. A file that will not load is worse than no
    # installer at all, so prove it before walking away.
    $null = Get-Content $SettingsPath -Raw | ConvertFrom-Json
} catch {
    Write-Host "ERROR: settings.json could not be written or is invalid after the merge." -ForegroundColor Red
    if ($backup -and (Test-Path $backup)) {
        Copy-Item $backup $SettingsPath -Force
        Write-Host "  Restored settings from $backup"
    }
    exit 1
}

# Exit explicitly. Without this the process inherits whatever $LASTEXITCODE
# happened to be, and install.bat's `if errorlevel 1` check aborts a perfectly
# successful install.
exit 0
