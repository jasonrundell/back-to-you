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

# Drain the hook payload even though the category is already known from the
# argument. Claude Code writes JSON to this process's stdin; leaving it unread
# risks blocking the writer once a payload outgrows the pipe buffer, and
# PreToolUse - the largest payload wired here - is the one that can.
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

# Never fail silently. A hook that plays nothing and says nothing is the
# hardest thing in this project to diagnose, so the reason lands somewhere a
# human can find it. Overwritten rather than appended: if playback is broken
# this runs on every response, and an append would grow without bound.
# Mirrors noteFailure() in hooks/play-lib.js.
$errorFile = "$env:USERPROFILE\.claude\.backtoyou-playback-error"
function Write-PlaybackError {
    param([string]$Detail)
    try {
        $ts = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        Set-Content -LiteralPath $errorFile -Value "$ts  $Detail" -NoNewline -Encoding utf8
    } catch { }
}

try {
    Add-Type -AssemblyName PresentationCore -ErrorAction Stop
} catch {
    Write-PlaybackError "Add-Type PresentationCore failed: $($_.Exception.Message)"
    exit 0
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

$files = Get-ChildItem "$dir\*.mp3", "$dir\*.wav" -ErrorAction SilentlyContinue
if ($files) {
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
            Wait-Dispatcher -Milliseconds ([int][math]::Min($ms, 6000))

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

# Always exit 0, explicitly. This script is attached to PreToolUse, where an
# exit code of 2 means "block this tool call" - a hook that failed noisily here
# would stop Claude from asking the question at all. Without an explicit exit
# the process inherits whatever $LASTEXITCODE happened to be.
exit 0
