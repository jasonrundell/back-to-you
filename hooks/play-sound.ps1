# Claude Code hook: plays task-complete or decision-needed sound based on last response
try {
    . "$PSScriptRoot\play-lib.ps1"
} catch {
    # The one failure the lib cannot report itself. Exit 0 regardless: on
    # PreToolUse a non-zero exit would block the tool call outright.
    try {
        $ts = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        [System.IO.File]::WriteAllText("$env:USERPROFILE\.claude\.backtoyou-playback-error", "$ts  play-lib.ps1 missing or failed to load: $($_.Exception.Message)`n", (New-Object System.Text.UTF8Encoding($false)))
    } catch { }
    exit 0
}

$inputData = Read-HookPayload
try {
    $data = $inputData | ConvertFrom-Json
    $lastMsg = $data.last_assistant_message
} catch {
    $lastMsg = ""
}

if ($lastMsg -match '\?[^a-zA-Z0-9]*$') {
    $category = "decision-needed"
} else {
    $category = "task-complete"
}

# This hook used to suppress its own clip when a subagent had just finished:
# SubagentStop's subagent-done clip landed moments earlier and the two read
# as one completion. SubagentStop is no longer wired and the category is
# gone, so there is nothing left to double up with - see src/settings.js.

Play-CategoryClip $category

# Always exit 0, explicitly. A non-zero exit surfaces a hook error in the
# transcript, and without this the process inherits whatever $LASTEXITCODE
# happened to be.
exit 0
