# Claude Code hook: plays task-complete or decision-needed sound based on last response
$inputData = [Console]::In.ReadToEnd()
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

# Active theme lives in one line of text so switching packs needs no reinstall.
$themeFile = "$env:USERPROFILE\.claude\sound-theme.txt"
$theme = if (Test-Path $themeFile) { (Get-Content $themeFile -Raw).Trim() } else { "claude" }
if (-not $theme) { $theme = "claude" }

$dir = "$env:USERPROFILE\.claude\sounds\$theme\$category"

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

# Always exit 0, explicitly. A non-zero exit surfaces a hook error in the
# transcript, and without this the process inherits whatever $LASTEXITCODE
# happened to be.
exit 0
