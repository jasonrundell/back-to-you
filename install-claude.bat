@echo off
:: StarCraft Sound Notifications — Claude Code / Cowork Hook Installer (Windows)
setlocal

set SCRIPT_DIR=%~dp0
set CLAUDE_DIR=%USERPROFILE%\.claude

echo Installing StarCraft sound notifications for Claude Code / Cowork (Windows)...

dir /b "%SCRIPT_DIR%sounds\task-complete\*.mp3" >nul 2>nul
if errorlevel 1 (
  echo ERROR: Missing task-complete MP3 files in "%SCRIPT_DIR%sounds\task-complete"
  exit /b 1
)

dir /b "%SCRIPT_DIR%sounds\decision-needed\*.mp3" >nul 2>nul
if errorlevel 1 (
  echo ERROR: Missing decision-needed MP3 files in "%SCRIPT_DIR%sounds\decision-needed"
  exit /b 1
)

:: Create directories
if not exist "%CLAUDE_DIR%\sounds\task-complete" mkdir "%CLAUDE_DIR%\sounds\task-complete"
if not exist "%CLAUDE_DIR%\sounds\decision-needed" mkdir "%CLAUDE_DIR%\sounds\decision-needed"
if not exist "%CLAUDE_DIR%\hooks" mkdir "%CLAUDE_DIR%\hooks"

:: Copy sounds
xcopy /Y "%SCRIPT_DIR%sounds\task-complete\*.mp3" "%CLAUDE_DIR%\sounds\task-complete\" >nul
echo   OK Task-complete sounds copied

xcopy /Y "%SCRIPT_DIR%sounds\decision-needed\*.mp3" "%CLAUDE_DIR%\sounds\decision-needed\" >nul
echo   OK Decision-needed sounds copied

:: Copy Claude hook scripts
copy /Y "%SCRIPT_DIR%hooks\play-sound.ps1" "%CLAUDE_DIR%\hooks\play-sound.ps1" >nul
echo   OK Claude Stop hook script installed

copy /Y "%SCRIPT_DIR%hooks\play-sound-decision.ps1" "%CLAUDE_DIR%\hooks\play-sound-decision.ps1" >nul
echo   OK Claude Notification hook script installed

:: Write or merge Claude settings.json using PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$settings = '%CLAUDE_DIR%\settings.json';" ^
  "$stopCmd = 'powershell -NoProfile -ExecutionPolicy Bypass -File \"%USERPROFILE%\\.claude\\hooks\\play-sound.ps1\"';" ^
  "$notifCmd = 'powershell -NoProfile -ExecutionPolicy Bypass -File \"%USERPROFILE%\\.claude\\hooks\\play-sound-decision.ps1\"';" ^
  "if (Test-Path $settings) {" ^
  "  $json = Get-Content $settings -Raw | ConvertFrom-Json;" ^
  "  if (-not $json.hooks) { $json | Add-Member -NotePropertyName hooks -NotePropertyValue ([PSCustomObject]@{}) };" ^
  "  $stopExists = $json.hooks.Stop | Where-Object { $_.hooks.command -like '*play-sound.ps1*' };" ^
  "  if (-not $stopExists) {" ^
  "    if (-not $json.hooks.Stop) { $json.hooks | Add-Member -NotePropertyName Stop -NotePropertyValue @() };" ^
  "    $json.hooks.Stop += @{ hooks = @(@{ type = 'command'; command = $stopCmd }) };" ^
  "    Write-Host '  OK Stop hook added to settings.json'" ^
  "  } else { Write-Host '  OK Stop hook already present - skipping' };" ^
  "  $notifExists = $json.hooks.Notification | Where-Object { $_.hooks.command -like '*play-sound-decision*' };" ^
  "  if (-not $notifExists) {" ^
  "    if (-not $json.hooks.Notification) { $json.hooks | Add-Member -NotePropertyName Notification -NotePropertyValue @() };" ^
  "    $json.hooks.Notification += @{ hooks = @(@{ type = 'command'; command = $notifCmd }) };" ^
  "    Write-Host '  OK Notification hook added to settings.json'" ^
  "  } else { Write-Host '  OK Notification hook already present - skipping' };" ^
  "  $json | ConvertTo-Json -Depth 10 | Set-Content $settings" ^
  "} else {" ^
  "  $content = '{\"hooks\":{\"Notification\":[{\"hooks\":[{\"type\":\"command\",\"command\":\"powershell -NoProfile -ExecutionPolicy Bypass -File \\\"%USERPROFILE%\\\\.claude\\\\hooks\\\\play-sound-decision.ps1\\\"\"}]}],\"Stop\":[{\"hooks\":[{\"type\":\"command\",\"command\":\"powershell -NoProfile -ExecutionPolicy Bypass -File \\\"%USERPROFILE%\\\\.claude\\\\hooks\\\\play-sound.ps1\\\"\"}]}]}}';" ^
  "  $content | Set-Content $settings;" ^
  "  Write-Host '  OK Created settings.json'" ^
  "}"

echo.
echo Claude setup complete! Restart Claude Code / Cowork to activate sound notifications.
if /I not "%~1"=="nopause" pause
