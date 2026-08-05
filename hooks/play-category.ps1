# Claude Code hook: plays a random clip from one named sound category.
#
# Used by every wired event except Stop, which has to work out its own category
# from the assistant's last message before it can play anything.
#
#   play-category.ps1 -Category decision-needed
#   play-category.ps1 -Category session-start
#   play-category.ps1 -Category subagent-done
#   play-category.ps1 -Category error
#
# Exits quietly when the category folder is missing or empty. That is the
# supported way to switch a sound off: delete the clips you do not want.
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Category
)

# Drain the hook payload even though the category is already known from the
# argument. Claude Code writes JSON to this process's stdin; leaving it unread
# risks blocking the writer once a payload outgrows the pipe buffer, and the
# larger events wired here (PreToolUse, SubagentStop) are the ones that can.
#
# Guarded on IsInputRedirected, or running this script by hand would sit there
# waiting for EOF instead of playing a sound.
if ([Console]::IsInputRedirected) {
    try { $null = [Console]::In.ReadToEnd() } catch { }
}

# Active theme lives in one line of text so switching packs needs no reinstall.
$themeFile = "$env:USERPROFILE\.claude\sound-theme.txt"
$theme = if (Test-Path $themeFile) { (Get-Content $themeFile -Raw).Trim() } else { "claude" }
if (-not $theme) { $theme = "claude" }

$dir = "$env:USERPROFILE\.claude\sounds\$theme\$Category"

Add-Type -AssemblyName PresentationCore
$files = Get-ChildItem "$dir\*.mp3", "$dir\*.wav" -ErrorAction SilentlyContinue
if ($files) {
    # SubagentStop and Stop are distinct events, but when a subagent is the
    # last thing a turn does, Stop fires moments after this one - two "done"
    # clips back to back for what reads as one completion. Timestamp it so
    # play-sound.ps1 can skip its own clip when it fires immediately after.
    if ($Category -eq 'subagent-done') {
        try {
            [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() | Out-File -FilePath "$env:USERPROFILE\.claude\.subagent-done-at" -Encoding ascii -NoNewline
        } catch { }
    }

    $f = ($files | Get-Random).FullName
    $player = New-Object System.Windows.Media.MediaPlayer
    $player.Open([uri]::new($f))

    # Open() is async. Wait briefly for the duration so short sounds do not
    # hold the hook open for a fixed 4 seconds.
    $deadline = (Get-Date).AddSeconds(2)
    while (-not $player.NaturalDuration.HasTimeSpan -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 25
    }

    $player.Play()
    $ms = if ($player.NaturalDuration.HasTimeSpan) {
        $player.NaturalDuration.TimeSpan.TotalMilliseconds + 150
    } else { 4000 }
    Start-Sleep -Milliseconds ([int][math]::Min($ms, 6000))

    $player.Stop()
    $player.Close()
}

# Always exit 0, explicitly. This script is attached to PreToolUse, where an
# exit code of 2 means "block this tool call" - a hook that failed noisily here
# would stop Claude from asking the question at all. Without an explicit exit
# the process inherits whatever $LASTEXITCODE happened to be.
exit 0
