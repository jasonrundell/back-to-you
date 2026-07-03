# Claude Code hook: plays task-complete or decision-needed sound based on last response
$inputData = [Console]::In.ReadToEnd()
try {
    $data = $inputData | ConvertFrom-Json
    $lastMsg = $data.last_assistant_message
} catch {
    $lastMsg = ""
}

if ($lastMsg -match '\?[^a-zA-Z0-9]*$') {
    $dir = "$env:USERPROFILE\.claude\sounds\decision-needed"
} else {
    $dir = "$env:USERPROFILE\.claude\sounds\task-complete"
}

Add-Type -AssemblyName PresentationCore
$files = Get-ChildItem "$dir\*.mp3" -ErrorAction SilentlyContinue
if ($files) {
    $f = ($files | Get-Random).FullName
    $player = New-Object System.Windows.Media.MediaPlayer
    $player.Open([uri]::new($f))
    $player.Play()
    Start-Sleep -Seconds 4
    $player.Stop()
    $player.Close()
}
