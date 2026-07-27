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

# Active theme lives in one line of text so switching packs needs no reinstall.
$themeFile = "$env:USERPROFILE\.claude\sound-theme.txt"
$theme = if (Test-Path $themeFile) { (Get-Content $themeFile -Raw).Trim() } else { "starcraft" }
if (-not $theme) { $theme = "starcraft" }

$dir = "$env:USERPROFILE\.claude\sounds\$theme\$category"

Add-Type -AssemblyName PresentationCore
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
