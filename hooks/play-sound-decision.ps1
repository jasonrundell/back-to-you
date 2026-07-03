# Claude Code hook: plays a random StarCraft sound when Claude needs a decision
Add-Type -AssemblyName PresentationCore
$dir = "$env:USERPROFILE\.claude\sounds\decision-needed"
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
