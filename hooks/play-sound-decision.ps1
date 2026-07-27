# Claude Code hook: plays a random sound when Claude needs a decision
Add-Type -AssemblyName PresentationCore

# Active theme lives in one line of text so switching packs needs no reinstall.
$themeFile = "$env:USERPROFILE\.claude\sound-theme.txt"
$theme = if (Test-Path $themeFile) { (Get-Content $themeFile -Raw).Trim() } else { "chiptune" }
if (-not $theme) { $theme = "chiptune" }

$dir = "$env:USERPROFILE\.claude\sounds\$theme\decision-needed"
$files = Get-ChildItem "$dir\*.mp3", "$dir\*.wav" -ErrorAction SilentlyContinue
if ($files) {
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
