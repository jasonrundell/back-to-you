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
# Rewrites rather than merges: it strips every entry this project owns, then
# writes the current plan back. That is what lets an upgrade correct an entry
# an older version got wrong. Hooks belonging to the user are untouched.
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
# SessionStart is deliberately NOT wired, and the session-start clip no longer
# plays. Even matched to 'startup' alone it fired roughly four times an hour
# in real use - 'startup' means every new session, not every app launch, and
# short-lived sessions are common. It was 69% of all sounds heard over a
# measured six-hour run, in bursts as tight as four in 43 seconds. It was also
# the least useful of the set: a session starting is the one moment you are
# already looking at the terminal, whereas task-complete and decision-needed
# earn their place precisely because you are not.
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
            Write-Host "ERROR: $SettingsPath exists but is not valid JSON:" -ForegroundColor Red
            Write-Host "  $($_.Exception.Message)"
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

# Every script this project has ever installed, including ones no longer
# shipped. play-sound-decision.ps1 was an earlier build's Notification hook,
# wired with no matcher; upgrading users kept it alongside the current entry
# and heard two clips for every prompt. Anything naming one of these is ours
# to remove and rewrite.
$ownedScripts = @('play-sound.ps1', 'play-category.ps1', 'play-sound-decision.ps1')

function Test-OwnedCommand {
    param([string]$Command)
    foreach ($script in $ownedScripts) {
        if ($Command -like "*$script*") { return $true }
    }
    return $false
}

# Pass one: strip every entry this project owns, across every event - not just
# the ones in $plan, so an entry left under an event we no longer wire still
# goes. Pass two rebuilds them from $plan, which is what makes an upgrade
# correct a stale path, a missing timeout, or a matcher an older version got
# wrong. The previous version skipped any event that already had an entry, so
# none of those could ever be fixed.
$removed = 0

foreach ($eventName in @($config.hooks.PSObject.Properties.Name)) {
    $keptGroups = @()

    foreach ($group in @($config.hooks.$eventName)) {
        if (-not $group) { continue }

        $keptHooks = @()
        foreach ($entry in @($group.hooks)) {
            if ($entry -and $entry.command -and (Test-OwnedCommand $entry.command)) {
                $removed++
                continue
            }
            if ($entry) { $keptHooks += $entry }
        }

        # A group holding nothing but our hooks goes with them. One holding a
        # hook of the user's own is kept, minus ours - its matcher is theirs,
        # not something to rewrite.
        if ($keptHooks.Count -eq 0) { continue }
        $group.hooks = @($keptHooks)
        $keptGroups += $group
    }

    $config.hooks.$eventName = @($keptGroups)
}

if ($removed -gt 0) {
    Write-Host "  OK Removed $removed existing Back to You hook entr$(if ($removed -eq 1) { 'y' } else { 'ies' })"
}

# Pass two: write the current plan in fresh.
foreach ($item in $plan) {
    $eventName = $item.Event
    $command = New-Command -Script $item.Script -Argument $item.Argument

    if (-not $config.hooks.PSObject.Properties[$eventName] -or $null -eq $config.hooks.$eventName) {
        $config.hooks | Add-Member -NotePropertyName $eventName -NotePropertyValue @() -Force
    }

    # An explicit short timeout: Claude Code's default for command hooks is
    # ten minutes, which is no safety net at all for something attached to
    # the end of every response.
    $group = @{ hooks = @(@{ type = 'command'; command = $command; timeout = 10 }) }
    if ($item.Matcher) { $group.matcher = $item.Matcher }

    $config.hooks.$eventName = @($config.hooks.$eventName) + $group
    Write-Host "  OK $eventName hook installed"
}

# Drop events left empty by pass one, so uninstalling a hook we used to wire
# does not leave `"SomeEvent": []` behind in the user's file.
foreach ($eventName in @($config.hooks.PSObject.Properties.Name)) {
    if (@($config.hooks.$eventName).Count -eq 0) {
        $config.hooks.PSObject.Properties.Remove($eventName)
    }
}

# ConvertTo-Json escapes the Windows path separators correctly.
try {
    $json = $config | ConvertTo-Json -Depth 10
    Set-Content -Path $SettingsPath -Value $json -Encoding UTF8

    # Read it back and reparse. A file that will not load is worse than no
    # installer at all, so prove it before walking away.
    $null = Get-Content $SettingsPath -Raw | ConvertFrom-Json
} catch {
    Write-Host "ERROR: settings.json could not be written or is invalid after the merge:" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)"
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
