# Shared by both Windows hooks; dot-sourced, never invoked directly.
#
# The PowerShell mirror of hooks/play-lib.js. Dot-sourcing this file only
# defines the functions and script-scope variables below - nothing here
# executes on load.

# A user can drop a three-minute file into a pack folder, and this runs at
# the end of every single response.
$script:WatchdogMs = 6000

# Active theme lives in one line of text so switching packs needs no reinstall.
$script:ThemeFile = "$env:USERPROFILE\.claude\sound-theme.txt"

# Never fail silently. A hook that plays nothing and says nothing is the
# hardest thing in this project to diagnose, so the reason lands somewhere a
# human can find it. Overwritten rather than appended: if playback is broken
# this runs on every response, and an append would grow without bound.
# Mirrors noteFailure() in hooks/play-lib.js.
$script:ErrorFile = "$env:USERPROFILE\.claude\.backtoyou-playback-error"

# Drain the hook payload even though the category is often already known from
# an argument. Claude Code writes JSON to this process's stdin; leaving it
# unread risks blocking the writer once a payload outgrows the pipe buffer,
# and PreToolUse - the largest payload wired here - is the one that can.
#
# Guarded on IsInputRedirected, or running a hook by hand would sit there
# waiting for EOF instead of playing a sound.
function Read-HookPayload {
    if ([Console]::IsInputRedirected) {
        try { return [Console]::In.ReadToEnd() } catch { }
    }
    return ''
}

function Write-PlaybackError {
    param([string]$Detail)
    try {
        $ts = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        [System.IO.File]::WriteAllText($script:ErrorFile, "$ts  $Detail`n", (New-Object System.Text.UTF8Encoding($false)))
    } catch { }
}

# MediaPlayer marshals its events (duration becoming known, MediaFailed)
# through the calling thread's Dispatcher. A plain script host never pumps
# one, so plain Start-Sleep leaves NaturalDuration unresolved and MediaFailed
# never fires - verified experimentally. Actual audio rendering does not need
# this: the underlying media session plays independently of the callback.
function Wait-Dispatcher {
    param([int]$Milliseconds)
    $frame = New-Object System.Windows.Threading.DispatcherFrame
    $timer = New-Object System.Windows.Threading.DispatcherTimer
    $timer.Interval = [TimeSpan]::FromMilliseconds([math]::Max($Milliseconds, 1))
    $timer.Add_Tick({ $frame.Continue = $false; $timer.Stop() }.GetNewClosure())
    $timer.Start()
    [System.Windows.Threading.Dispatcher]::PushFrame($frame)
}

# Play a random clip from one named sound category. Exits quietly (just
# returns) when the category folder is missing or empty - that is the
# supported way to switch a sound off: delete the clips you do not want.
# Never throws out of itself; every failure path reports through
# Write-PlaybackError and returns.
function Play-CategoryClip {
    param([string]$Category)

    $theme = if (Test-Path $script:ThemeFile) { (Get-Content $script:ThemeFile -Raw).Trim() } else { "claude" }
    if (-not $theme) { $theme = "claude" }

    $dir = "$env:USERPROFILE\.claude\sounds\$theme\$Category"

    try {
        Add-Type -AssemblyName PresentationCore -ErrorAction Stop
    } catch {
        Write-PlaybackError "Add-Type PresentationCore failed: $($_.Exception.Message)"
        return
    }

    $files = Get-ChildItem "$dir\*.mp3", "$dir\*.wav" -ErrorAction SilentlyContinue
    if (-not $files) { return }

    $f = ($files | Get-Random).FullName
    $mediaState = @{ Failed = $false; Message = '' }
    try {
        $player = New-Object System.Windows.Media.MediaPlayer
        $sub = Register-ObjectEvent -InputObject $player -EventName MediaFailed -MessageData $mediaState -Action {
            $Event.MessageData.Failed = $true
            $Event.MessageData.Message = $Event.SourceEventArgs.ErrorException.Message
        }

        $player.Open([uri]::new($f))

        # Open() is async. Wait briefly for the duration so short sounds do not
        # hold the hook open for a fixed 4 seconds.
        $deadline = (Get-Date).AddSeconds(2)
        while (-not $player.NaturalDuration.HasTimeSpan -and (Get-Date) -lt $deadline -and -not $mediaState.Failed) {
            Wait-Dispatcher -Milliseconds 25
        }

        if (-not $mediaState.Failed) {
            $player.Play()
            $ms = if ($player.NaturalDuration.HasTimeSpan) {
                $player.NaturalDuration.TimeSpan.TotalMilliseconds + 150
            } else { 4000 }
            Wait-Dispatcher -Milliseconds ([int][math]::Min($ms, $script:WatchdogMs))

            $player.Stop()
        }
        $player.Close()

        Unregister-Event -SourceIdentifier $sub.Name -ErrorAction SilentlyContinue
        Remove-Job -Id $sub.Id -ErrorAction SilentlyContinue

        if ($mediaState.Failed) {
            Write-PlaybackError "MediaFailed: $($mediaState.Message)  clip=$f"
        }
    } catch {
        Write-PlaybackError "playback exception: $($_.Exception.Message)  clip=$f"
    }
}
