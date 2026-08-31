# Claude Code hook: plays a random clip from one named sound category.
#
# Used by every wired event except Stop, which has to work out its own category
# from the assistant's last message before it can play anything.
#
#   play-category.ps1 -Category decision-needed
#   play-category.ps1 -Category error
#
# Exits quietly when the category folder is missing or empty. That is the
# supported way to switch a sound off: delete the clips you do not want.
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Category
)

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

# The rationale for draining stdin even though the category is already known
# from the argument lives with Read-HookPayload, in play-lib.ps1.
$null = Read-HookPayload

Play-CategoryClip $Category

# Always exit 0, explicitly. This script is attached to PreToolUse, where an
# exit code of 2 means "block this tool call" - a hook that failed noisily here
# would stop Claude from asking the question at all. Without an explicit exit
# the process inherits whatever $LASTEXITCODE happened to be.
exit 0
